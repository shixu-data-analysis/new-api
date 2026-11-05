package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const redisRateLimitNamespace = "rateLimit:v2"

// Redis rate limiting intentionally uses a fixed window. The single Lua script
// makes increment, expiry, and the limit decision atomic, while retaining the
// simple fixed-window behavior: traffic at a window boundary can burst up to
// twice the configured limit. Do not replace this with a sliding-window ZSET
// unless that externally visible behavior is intentionally changed.
//
// The script takes one or more windows (KEYS[i] with ARGV[2i-1] as the limit and
// ARGV[2i] as the duration) and counts the request in them in order within one
// round trip, stopping at the first full window: a request rejected by an earlier
// window is not counted in the later ones. It returns the decision, count and TTL
// of the rejecting window, or of the last window when all allow the request.
const redisFixedWindowScript = `
for index, key in ipairs(KEYS) do
  local duration = ARGV[index * 2]
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, duration)
  end
  local ttl = redis.call('TTL', key)
  if ttl < 0 then
    redis.call('EXPIRE', key, duration)
    ttl = redis.call('TTL', key)
  end
  if count > tonumber(ARGV[index * 2 - 1]) then
    return {0, count, ttl}
  end
  if index == #KEYS then
    return {1, count, ttl}
  end
end
`

var inMemoryRateLimiter common.InMemoryRateLimiter

var defNext = func(c *gin.Context) {
	c.Next()
}

func redisIPRateLimitKey(mark string, clientIP string) string {
	return fmt.Sprintf("%s:ip:%s:%s", redisRateLimitNamespace, mark, clientIP)
}

func redisUserRateLimitKey(mark string, userID int) string {
	return fmt.Sprintf("%s:user:%s:%d", redisRateLimitNamespace, mark, userID)
}

func redisReplyInteger(value interface{}) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case string:
		return strconv.ParseInt(typed, 10, 64)
	case []byte:
		return strconv.ParseInt(string(typed), 10, 64)
	default:
		return 0, fmt.Errorf("unexpected Redis integer reply type %T", value)
	}
}

// redisFixedWindow is one fixed window of the Redis rate limit.
type redisFixedWindow struct {
	key           string
	maxRequestNum int
	duration      int64
}

func redisFixedWindowTake(ctx context.Context, key string, maxRequestNum int, duration int64) (bool, int64, int64, error) {
	return redisFixedWindowsTake(ctx, redisFixedWindow{key: key, maxRequestNum: maxRequestNum, duration: duration})
}

// redisFixedWindowsTake counts one request in each window in order with one Redis round trip and stops at the first
// full window. It returns whether the request is allowed and the count and TTL of the window that decided.
func redisFixedWindowsTake(ctx context.Context, windows ...redisFixedWindow) (bool, int64, int64, error) {
	if common.RDB == nil {
		return false, 0, 0, errors.New("Redis client is not initialized")
	}
	if len(windows) == 0 {
		return false, 0, 0, errors.New("rate limit has no window")
	}
	keys := make([]string, 0, len(windows))
	arguments := make([]interface{}, 0, len(windows)*2)
	for _, window := range windows {
		if window.key == "" {
			return false, 0, 0, errors.New("rate limit key is empty")
		}
		if window.maxRequestNum <= 0 {
			return false, 0, 0, errors.New("rate limit maximum must be positive")
		}
		if window.duration <= 0 {
			return false, 0, 0, errors.New("rate limit duration must be positive")
		}
		keys = append(keys, window.key)
		arguments = append(arguments, window.maxRequestNum, window.duration)
	}

	values, err := common.RDB.Eval(ctx, redisFixedWindowScript, keys, arguments...).Slice()
	if err != nil {
		return false, 0, 0, err
	}
	if len(values) != 3 {
		return false, 0, 0, fmt.Errorf("unexpected Redis rate limit reply length %d", len(values))
	}

	allowedValue, err := redisReplyInteger(values[0])
	if err != nil {
		return false, 0, 0, err
	}
	count, err := redisReplyInteger(values[1])
	if err != nil {
		return false, 0, 0, err
	}
	ttlSeconds, err := redisReplyInteger(values[2])
	if err != nil {
		return false, 0, 0, err
	}

	return allowedValue == 1, count, ttlSeconds, nil
}

func redisRateLimiter(c *gin.Context, maxRequestNum int, duration int64, mark string) {
	allowed, _, ttlSeconds, err := redisFixedWindowTake(
		c.Request.Context(),
		redisIPRateLimitKey(mark, c.ClientIP()),
		maxRequestNum,
		duration,
	)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("rate limit check failed (mark=%s): %v", mark, err))
		c.Status(http.StatusInternalServerError)
		c.Abort()
		return
	}
	if !allowed {
		writeRateLimited(c, ttlSeconds)
	}
}

func memoryRateLimiter(c *gin.Context, maxRequestNum int, duration int64, mark string) {
	key := mark + c.ClientIP()
	if !inMemoryRateLimiter.Request(key, maxRequestNum, duration) {
		writeRateLimited(c, duration)
		return
	}
}

// writeRateLimited rejects the request with 429 and a Retry-After hint so
// clients can back off instead of treating the rejection as a fatal error.
// The in-memory limiter cannot report the remaining window, so callers
// without a TTL pass the full window duration as a conservative upper bound.
func writeRateLimited(c *gin.Context, retryAfterSeconds int64) {
	if retryAfterSeconds > 0 {
		c.Header("Retry-After", strconv.FormatInt(retryAfterSeconds, 10))
	}
	c.Status(http.StatusTooManyRequests)
	c.Abort()
}

func rateLimitFactory(maxRequestNum int, duration int64, mark string) func(c *gin.Context) {
	if common.RedisEnabled {
		return func(c *gin.Context) {
			redisRateLimiter(c, maxRequestNum, duration, mark)
		}
	}
	// It's safe to call multi times.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	return func(c *gin.Context) {
		memoryRateLimiter(c, maxRequestNum, duration, mark)
	}
}

func GlobalWebRateLimit() func(c *gin.Context) {
	if common.GlobalWebRateLimitEnable {
		return rateLimitFactory(common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration, "GW")
	}
	return defNext
}

// rateLimitWindow is one bucket of a rate limit, under its Redis key and its in-memory key.
type rateLimitWindow struct {
	redisFixedWindow
	memoryKey string
}

// takeRateLimit counts one request in each window in order, stopping at the first full one, and rejects it with 429
// when a window is full. With Redis all windows take one round trip. It returns whether the request may continue.
func takeRateLimit(c *gin.Context, windows ...rateLimitWindow) bool {
	if common.RedisEnabled {
		redisWindows := make([]redisFixedWindow, len(windows))
		for index, window := range windows {
			redisWindows[index] = window.redisFixedWindow
		}
		allowed, _, ttlSeconds, err := redisFixedWindowsTake(c.Request.Context(), redisWindows...)
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("rate limit check failed (key=%s): %v", windows[0].key, err))
			c.Status(http.StatusInternalServerError)
			c.Abort()
			return false
		}
		if !allowed {
			writeRateLimited(c, ttlSeconds)
			return false
		}
		return true
	}
	for _, window := range windows {
		if !inMemoryRateLimiter.Request(window.memoryKey, window.maxRequestNum, window.duration) {
			writeRateLimited(c, window.duration)
			return false
		}
	}
	return true
}

// rateLimitUser is the user a request counts against: the user of a dashboard access token whose signature and
// lifetime are valid, or of a personal access token, which the Canvas Desktop sends through Cloud. As in
// authentication, a dashboard token is never tried as a personal one. Sessions and user status are not checked here;
// UserAuth still decides whether the request is allowed, and it reuses the personal token lookup.
func rateLimitUser(c *gin.Context) (int, bool) {
	raw, ok := authorizationToken(c.GetHeader("Authorization"))
	if !ok {
		return 0, false
	}
	identity, internal, err := service.ParseDashboardAccessToken(raw)
	if internal {
		return identity.UserID, err == nil
	}
	user, err := lookupDashboardPAT(c, raw)
	if err != nil || user == nil || user.Id <= 0 {
		return 0, false
	}
	return user.Id, true
}

// GlobalAPIRateLimit counts a request with a valid dashboard or personal access token against its user
// (GLOBAL_API_RATE_LIMIT) and against its address with the larger backstop (GLOBAL_API_IP_RATE_LIMIT), so customers
// behind one office address keep their own budgets while one address still cannot flood the service. A request without
// a valid token counts only against its address with GLOBAL_API_RATE_LIMIT, as before. Sign-in, refresh and the other
// critical routes keep their own address limits. Both windows must not exceed RateLimitKeyExpirationDuration.
func GlobalAPIRateLimit() func(c *gin.Context) {
	if !common.GlobalApiRateLimitEnable {
		return defNext
	}
	if !common.RedisEnabled {
		// It's safe to call multi times.
		inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	}
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		userID, authenticated := rateLimitUser(c)
		if !authenticated {
			takeRateLimit(c, rateLimitWindow{
				redisFixedWindow: redisFixedWindow{key: redisIPRateLimitKey("GA", clientIP), maxRequestNum: common.GlobalApiRateLimitNum, duration: common.GlobalApiRateLimitDuration},
				memoryKey:        "GA" + clientIP,
			})
			return
		}
		// The address backstop comes first: a request it rejects does not use the user's budget.
		takeRateLimit(c, rateLimitWindow{
			redisFixedWindow: redisFixedWindow{key: redisIPRateLimitKey("GAI", clientIP), maxRequestNum: common.GlobalApiIpRateLimitNum, duration: common.GlobalApiIpRateLimitDuration},
			memoryKey:        "GAI" + clientIP,
		}, rateLimitWindow{
			redisFixedWindow: redisFixedWindow{key: redisUserRateLimitKey("GAU", userID), maxRequestNum: common.GlobalApiRateLimitNum, duration: common.GlobalApiRateLimitDuration},
			memoryKey:        fmt.Sprintf("GAU:user:%d", userID),
		})
	}
}

func CriticalRateLimit() func(c *gin.Context) {
	if common.CriticalRateLimitEnable {
		return rateLimitFactory(common.CriticalRateLimitNum, common.CriticalRateLimitDuration, "CT")
	}
	return defNext
}

// AuthRefreshRateLimit follows the critical switch but counts in its own bucket, so office-wide refreshes do not
// use up the sign-in attempts of everyone behind the same address.
func AuthRefreshRateLimit() func(c *gin.Context) {
	if common.CriticalRateLimitEnable {
		return rateLimitFactory(common.AuthRefreshRateLimitNum, common.AuthRefreshRateLimitDuration, "AR")
	}
	return defNext
}

func UserCriticalRateLimit(scope string) func(c *gin.Context) {
	if !common.CriticalRateLimitEnable {
		return defNext
	}
	return userRateLimitFactory(
		common.CriticalRateLimitNum,
		common.CriticalRateLimitDuration,
		"UC:"+scope,
	)
}

func DownloadRateLimit() func(c *gin.Context) {
	return rateLimitFactory(common.DownloadRateLimitNum, common.DownloadRateLimitDuration, "DW")
}

func UploadRateLimit() func(c *gin.Context) {
	return rateLimitFactory(common.UploadRateLimitNum, common.UploadRateLimitDuration, "UP")
}

// userRateLimitFactory creates a rate limiter keyed by authenticated user ID
// instead of client IP, making it resistant to proxy rotation attacks.
// Must be used AFTER authentication middleware (UserAuth).
func userRateLimitFactory(maxRequestNum int, duration int64, mark string) func(c *gin.Context) {
	if common.RedisEnabled {
		return func(c *gin.Context) {
			userID := c.GetInt("id")
			if userID == 0 {
				c.Status(http.StatusUnauthorized)
				c.Abort()
				return
			}
			userRedisRateLimiter(c, maxRequestNum, duration, redisUserRateLimitKey(mark, userID))
		}
	}
	// It's safe to call multi times.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	return func(c *gin.Context) {
		userID := c.GetInt("id")
		if userID == 0 {
			c.Status(http.StatusUnauthorized)
			c.Abort()
			return
		}
		key := fmt.Sprintf("%s:user:%d", mark, userID)
		if !inMemoryRateLimiter.Request(key, maxRequestNum, duration) {
			writeRateLimited(c, duration)
			return
		}
	}
}

// userRedisRateLimiter is like redisRateLimiter but accepts a pre-built key
// (to support user-ID-based keys).
func userRedisRateLimiter(c *gin.Context, maxRequestNum int, duration int64, key string) {
	allowed, _, ttlSeconds, err := redisFixedWindowTake(c.Request.Context(), key, maxRequestNum, duration)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("rate limit check failed (key=%s): %v", key, err))
		c.Status(http.StatusInternalServerError)
		c.Abort()
		return
	}
	if !allowed {
		writeRateLimited(c, ttlSeconds)
	}
}

// SearchRateLimit returns a per-user rate limiter for search endpoints.
// Configurable via SEARCH_RATE_LIMIT_ENABLE / SEARCH_RATE_LIMIT / SEARCH_RATE_LIMIT_DURATION.
func SearchRateLimit() func(c *gin.Context) {
	if !common.SearchRateLimitEnable {
		return defNext
	}
	return userRateLimitFactory(common.SearchRateLimitNum, common.SearchRateLimitDuration, "SR")
}
