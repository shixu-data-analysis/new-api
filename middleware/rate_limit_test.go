package middleware

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useRateLimitMiniRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()

	previousRedisEnabled := common.RedisEnabled
	previousRedisClient := common.RDB
	redisServer := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: redisServer.Addr()})
	require.NoError(t, redisClient.Ping(context.Background()).Err())

	common.RedisEnabled = true
	common.RDB = redisClient
	t.Cleanup(func() {
		_ = redisClient.Close()
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRedisClient
	})

	return redisServer, redisClient
}

func performRateLimitRequest(router http.Handler, path string, remoteAddr string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.RemoteAddr = remoteAddr
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestRedisIPRateLimiterThresholdTTLAndNamespace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/limited", rateLimitFactory(2, 37, "TEST"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	remoteAddr := "192.0.2.10:12345"
	legacyKey := "rateLimit:TEST192.0.2.10"
	_, err := redisServer.Push(legacyKey, "legacy-list-entry")
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", remoteAddr).Code)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", remoteAddr).Code)
	limitedResponse := performRateLimitRequest(router, "/limited", remoteAddr)
	assert.Equal(t, http.StatusTooManyRequests, limitedResponse.Code)
	assert.Equal(t, "37", limitedResponse.Header().Get("Retry-After"))

	key := redisIPRateLimitKey("TEST", "192.0.2.10")
	count, err := redisServer.Get(key)
	require.NoError(t, err)
	assert.Equal(t, "3", count)
	assert.Equal(t, 37*time.Second, redisServer.TTL(key))
	assert.True(t, redisServer.Exists(legacyKey), "the v2 counter must not touch an old list key")
}

func TestRedisUserRateLimiterUsesSharedFixedWindow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	router.GET(
		"/limited",
		func(c *gin.Context) { c.Set("id", 42) },
		userRateLimitFactory(1, 23, "USER"),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)

	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", "192.0.2.20:12345").Code)
	assert.Equal(t, http.StatusTooManyRequests, performRateLimitRequest(router, "/limited", "198.51.100.20:12345").Code)

	key := redisUserRateLimitKey("USER", 42)
	assert.True(t, redisServer.Exists(key))
	assert.Equal(t, 23*time.Second, redisServer.TTL(key))
}

func TestRedisEmailVerificationRateLimiterPreservesResponseAndTTL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/verify", EmailVerificationRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	remoteAddr := "192.0.2.30:12345"
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/verify", remoteAddr).Code)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/verify", remoteAddr).Code)
	response := performRateLimitRequest(router, "/verify", remoteAddr)
	assert.Equal(t, http.StatusTooManyRequests, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"发送过于频繁，请等待 30 秒后再试"}`, response.Body.String())

	key := redisIPRateLimitKey(EmailVerificationRateLimitMark, "192.0.2.30")
	assert.True(t, redisServer.Exists(key))
	assert.Equal(t, time.Duration(EmailVerificationDuration)*time.Second, redisServer.TTL(key))
}

func TestRedisFixedWindowIsAtomicUnderConcurrency(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const (
		requestCount = 20
		maximumCount = 7
		duration     = int64(41)
	)
	key := redisIPRateLimitKey("CONCURRENT", "192.0.2.40")

	var allowedCount atomic.Int64
	errorsFound := make(chan error, requestCount)
	var waitGroup sync.WaitGroup
	waitGroup.Add(requestCount)
	for range requestCount {
		go func() {
			defer waitGroup.Done()
			allowed, _, _, err := redisFixedWindowTake(context.Background(), key, maximumCount, duration)
			if err != nil {
				errorsFound <- err
				return
			}
			if allowed {
				allowedCount.Add(1)
			}
		}()
	}
	waitGroup.Wait()
	close(errorsFound)
	for err := range errorsFound {
		require.NoError(t, err)
	}

	assert.Equal(t, int64(maximumCount), allowedCount.Load())
	count, err := redisServer.Get(key)
	require.NoError(t, err)
	assert.Equal(t, "20", count)
	assert.Equal(t, time.Duration(duration)*time.Second, redisServer.TTL(key))
}

func TestRedisFixedWindowResetsAtBoundary(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const duration = int64(10)
	key := redisIPRateLimitKey("BOUNDARY", "192.0.2.50")

	for range 2 {
		allowed, _, _, err := redisFixedWindowTake(context.Background(), key, 2, duration)
		require.NoError(t, err)
		assert.True(t, allowed)
	}
	allowed, _, _, err := redisFixedWindowTake(context.Background(), key, 2, duration)
	require.NoError(t, err)
	assert.False(t, allowed)

	// This reset is intentional fixed-window behavior. A client can consume one
	// full allowance immediately before and another immediately after a boundary.
	redisServer.FastForward(time.Duration(duration) * time.Second)
	for range 2 {
		allowed, _, _, err = redisFixedWindowTake(context.Background(), key, 2, duration)
		require.NoError(t, err)
		assert.True(t, allowed)
	}
}

func TestRedisFixedWindowRepairsCounterWithoutTTL(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const duration = int64(29)
	key := redisIPRateLimitKey("MISSING-TTL", "192.0.2.51")
	redisServer.Set(key, "5")

	allowed, count, ttl, err := redisFixedWindowTake(context.Background(), key, 3, duration)
	require.NoError(t, err)
	assert.False(t, allowed)
	assert.Equal(t, int64(6), count)
	assert.Equal(t, duration, ttl)
	assert.Equal(t, time.Duration(duration)*time.Second, redisServer.TTL(key))

	redisServer.FastForward(time.Duration(duration) * time.Second)
	assert.False(t, redisServer.Exists(key), "a recovered counter must not remain permanently rate-limited")
}

func TestRedisFailurePolicies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, redisClient := useRateLimitMiniRedis(t)
	require.NoError(t, redisClient.Close())

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/ip", rateLimitFactory(1, 30, "FAIL-IP"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.GET(
		"/user",
		func(c *gin.Context) { c.Set("id", 7) },
		userRateLimitFactory(1, 30, "FAIL-USER"),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)
	router.GET("/email", EmailVerificationRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	ipResponse := performRateLimitRequest(router, "/ip", "192.0.2.60:12345")
	assert.Equal(t, http.StatusInternalServerError, ipResponse.Code)
	assert.Empty(t, ipResponse.Body.String())
	userResponse := performRateLimitRequest(router, "/user", "192.0.2.61:12345")
	assert.Equal(t, http.StatusInternalServerError, userResponse.Code)
	assert.Empty(t, userResponse.Body.String())
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/email", "192.0.2.62:12345").Code)
}

func TestAuthRefreshDoesNotShareTheSignInBucket(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousEnabled := common.CriticalRateLimitEnable
	common.CriticalRateLimitEnable = true
	t.Cleanup(func() { common.CriticalRateLimitEnable = previousEnabled })

	for _, backend := range []struct {
		name   string
		office string
		redis  bool
	}{
		{name: "redis", office: "192.0.2.20:443", redis: true},
		{name: "memory", office: "192.0.2.21:443"},
	} {
		t.Run(backend.name, func(t *testing.T) {
			if backend.redis {
				useRateLimitMiniRedis(t)
			} else {
				previousRedisEnabled := common.RedisEnabled
				common.RedisEnabled = false
				t.Cleanup(func() { common.RedisEnabled = previousRedisEnabled })
			}

			router := gin.New()
			require.NoError(t, router.SetTrustedProxies(nil))
			ok := func(c *gin.Context) { c.Status(http.StatusNoContent) }
			router.GET("/login", CriticalRateLimit(), ok)
			router.GET("/refresh", AuthRefreshRateLimit(), ok)

			for range common.CriticalRateLimitNum {
				require.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/login", backend.office).Code)
			}
			assert.Equal(t, http.StatusTooManyRequests, performRateLimitRequest(router, "/login", backend.office).Code)

			for range common.AuthRefreshRateLimitNum {
				require.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/refresh", backend.office).Code)
			}
			assert.Equal(t, http.StatusTooManyRequests, performRateLimitRequest(router, "/refresh", backend.office).Code)
		})
	}
}

func issueTestAccessToken(t *testing.T, userID int) string {
	t.Helper()
	token, _, err := service.IssueAccessToken(service.AuthIdentity{UserID: userID, SessionID: fmt.Sprintf("session-%d", userID), UserAuthVersion: 1, SessionVersion: 1})
	require.NoError(t, err)
	return token
}

func performAuthorizedRateLimitRequest(router http.Handler, path string, remoteAddr string, token string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.RemoteAddr = remoteAddr
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	router.ServeHTTP(recorder, request)
	return recorder
}

// Users behind one office address keep their own budgets; the address backstop still caps the whole office, and a
// request without a valid access token keeps the old address limit.
func TestGlobalAPIRateLimitCountsUsersWithAnAddressBackstop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := []any{common.GlobalApiRateLimitEnable, common.GlobalApiRateLimitNum, common.GlobalApiRateLimitDuration, common.GlobalApiIpRateLimitNum, common.GlobalApiIpRateLimitDuration, common.SessionSecret}
	common.GlobalApiRateLimitEnable, common.GlobalApiRateLimitNum, common.GlobalApiRateLimitDuration = true, 3, 180
	common.GlobalApiIpRateLimitNum, common.GlobalApiIpRateLimitDuration = 5, 180
	common.SessionSecret = "rate-limit-test-secret"
	t.Cleanup(func() {
		common.GlobalApiRateLimitEnable = previous[0].(bool)
		common.GlobalApiRateLimitNum = previous[1].(int)
		common.GlobalApiRateLimitDuration = previous[2].(int64)
		common.GlobalApiIpRateLimitNum = previous[3].(int)
		common.GlobalApiIpRateLimitDuration = previous[4].(int64)
		common.SessionSecret = previous[5].(string)
	})

	for _, backend := range []struct {
		name   string
		office string
		redis  bool
	}{
		{name: "redis", office: "192.0.2.30:443", redis: true},
		{name: "memory", office: "192.0.2.31:443"},
	} {
		t.Run(backend.name, func(t *testing.T) {
			commands := &redisCommandCounter{}
			if backend.redis {
				_, redisClient := useRateLimitMiniRedis(t)
				redisClient.AddHook(commands)
			} else {
				previousRedisEnabled := common.RedisEnabled
				common.RedisEnabled = false
				t.Cleanup(func() { common.RedisEnabled = previousRedisEnabled })
			}
			router := gin.New()
			require.NoError(t, router.SetTrustedProxies(nil))
			router.GET("/api/self", GlobalAPIRateLimit(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
			alice, bob, carol := issueTestAccessToken(t, 101), issueTestAccessToken(t, 102), issueTestAccessToken(t, 103)

			// Each user has 3; Alice's limit does not touch Bob's.
			for range 3 {
				require.Equal(t, http.StatusNoContent, performAuthorizedRateLimitRequest(router, "/api/self", backend.office, alice).Code)
			}
			if backend.redis {
				// The address backstop and the user window take one Redis round trip per request, as one window did.
				assert.Equal(t, int64(3), commands.count.Load())
			}
			assert.Equal(t, http.StatusTooManyRequests, performAuthorizedRateLimitRequest(router, "/api/self", backend.office, alice).Code)
			require.Equal(t, http.StatusNoContent, performAuthorizedRateLimitRequest(router, "/api/self", backend.office, bob).Code)
			// The address backstop of 5 counts every authenticated request of the office, rejected ones included.
			assert.Equal(t, http.StatusTooManyRequests, performAuthorizedRateLimitRequest(router, "/api/self", backend.office, carol).Code)

			// A forged token does not get a user budget; it falls back to the address limit of 3.
			other := strings.Replace(backend.office, ".3", ".4", 1)
			for range 3 {
				require.Equal(t, http.StatusNoContent, performAuthorizedRateLimitRequest(router, "/api/self", other, alice+"x").Code)
			}
			assert.Equal(t, http.StatusTooManyRequests, performAuthorizedRateLimitRequest(router, "/api/self", other, "").Code)
		})
	}
}

// The Canvas Desktop reaches /api through Cloud with a personal access token, so two Desktop customers behind one
// office address keep their own budgets too. A token is looked up only after the address limit allows it, so made-up
// tokens stop reaching the database once that limit is used up, and the remembered user of a token never lets
// authentication skip its own lookup.
func TestGlobalAPIRateLimitCountsPersonalAccessTokenUsers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupDashboardAuthMiddlewareTest(t)
	previous := []any{common.GlobalApiRateLimitEnable, common.GlobalApiRateLimitNum, common.GlobalApiRateLimitDuration, common.GlobalApiIpRateLimitNum, common.GlobalApiIpRateLimitDuration}
	common.GlobalApiRateLimitEnable, common.GlobalApiRateLimitNum, common.GlobalApiRateLimitDuration = true, 2, 180
	common.GlobalApiIpRateLimitNum, common.GlobalApiIpRateLimitDuration = 10, 180
	personalTokenUsers.Purge()
	t.Cleanup(func() {
		common.GlobalApiRateLimitEnable = previous[0].(bool)
		common.GlobalApiRateLimitNum = previous[1].(int)
		common.GlobalApiRateLimitDuration = previous[2].(int64)
		common.GlobalApiIpRateLimitNum = previous[3].(int)
		common.GlobalApiIpRateLimitDuration = previous[4].(int64)
		personalTokenUsers.Purge()
	})
	for _, backend := range []struct {
		name    string
		address string
		redis   bool
	}{
		{name: "memory", address: "192.0.2.6"},
		{name: "redis", address: "192.0.2.7", redis: true},
	} {
		t.Run(backend.name, func(t *testing.T) {
			personalTokenUsers.Purge()
			if backend.redis {
				useRateLimitMiniRedis(t)
			}
			alice := createMiddlewarePATUser(t, "pat-limit-alice-"+backend.name, "pat-limit-alice-key-"+backend.name)
			bob := createMiddlewarePATUser(t, "pat-limit-bob-"+backend.name, "pat-limit-bob-key-"+backend.name)
			carol := createMiddlewarePATUser(t, "pat-limit-carol-"+backend.name, "pat-limit-carol-key-"+backend.name)
			tokenLookups := 0
			require.NoError(t, model.DB.Callback().Query().After("gorm:query").Register("count_access_token_lookups_"+backend.name, func(db *gorm.DB) {
				if strings.Contains(db.Statement.SQL.String(), "access_token") {
					tokenLookups++
				}
			}))

			router := gin.New()
			require.NoError(t, router.SetTrustedProxies(nil))
			router.GET("/api/self", GlobalAPIRateLimit(), UserAuth(), func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"id": c.GetInt("id")}) })
			office := backend.address + "0:443"

			// Alice's first request counts against the office address and teaches the limit her user; the next two use her
			// budget of 2 and the fourth is rejected. Bob's budget is his own.
			for range 3 {
				response := performAuthorizedRateLimitRequest(router, "/api/self", office, *alice.AccessToken)
				require.Equal(t, http.StatusOK, response.Code)
				assert.JSONEq(t, fmt.Sprintf(`{"id":%d}`, alice.Id), response.Body.String())
			}
			assert.Equal(t, http.StatusTooManyRequests, performAuthorizedRateLimitRequest(router, "/api/self", office, *alice.AccessToken).Code)
			for range 2 {
				require.Equal(t, http.StatusOK, performAuthorizedRateLimitRequest(router, "/api/self", office, *bob.AccessToken).Code)
			}
			// One lookup per request that reaches authentication: the limit's lookup is reused, and a rejected request has none.
			assert.Equal(t, 5, tokenLookups)

			// Made-up tokens count against the address limit of 2 before any lookup; once it is used up they stop reaching
			// the database.
			stranger := backend.address + "1:443"
			for range 2 {
				require.Equal(t, http.StatusUnauthorized, performAuthorizedRateLimitRequest(router, "/api/self", stranger, "unknown-key").Code)
			}
			lookupsBeforeFlood := tokenLookups
			for range 5 {
				require.Equal(t, http.StatusTooManyRequests, performAuthorizedRateLimitRequest(router, "/api/self", stranger, "unknown-key").Code)
			}
			assert.Equal(t, lookupsBeforeFlood, tokenLookups)

			// A token replaced after the limit remembered its user keeps that budget but is rejected by authentication.
			home := backend.address + "2:443"
			require.Equal(t, http.StatusOK, performAuthorizedRateLimitRequest(router, "/api/self", home, *carol.AccessToken).Code)
			require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", carol.Id).Update("access_token", "pat-limit-carol-new-"+backend.name).Error)
			assert.Equal(t, http.StatusUnauthorized, performAuthorizedRateLimitRequest(router, "/api/self", home, *carol.AccessToken).Code)
			// That rejection makes the limit forget the token, so it no longer uses Carol's budget.
			_, remembered, err := personalTokenUsers.Get(sha256.Sum256([]byte(*carol.AccessToken)))
			require.NoError(t, err)
			assert.False(t, remembered)
		})
	}
}

// redisCommandCounter counts the commands a Redis client sends.
type redisCommandCounter struct{ count atomic.Int64 }

func (counter *redisCommandCounter) BeforeProcess(ctx context.Context, _ redis.Cmder) (context.Context, error) {
	counter.count.Add(1)
	return ctx, nil
}

func (counter *redisCommandCounter) AfterProcess(context.Context, redis.Cmder) error { return nil }

func (counter *redisCommandCounter) BeforeProcessPipeline(ctx context.Context, commands []redis.Cmder) (context.Context, error) {
	counter.count.Add(int64(len(commands)))
	return ctx, nil
}

func (counter *redisCommandCounter) AfterProcessPipeline(context.Context, []redis.Cmder) error {
	return nil
}
