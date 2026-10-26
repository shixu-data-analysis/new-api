package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Blank entries are skipped, as in TRUSTED_PROXIES.
const testCloudflareEdges = "173.245.48.0/20, ,2606:4700::/32,"

const testEdgeOriginSecret = "edge-origin-secret-0123456789abcdef"

func newEdgeClientIPRouter(t *testing.T, edges string, secret string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	t.Setenv("TRUSTED_PROXIES", "")
	t.Setenv("CLOUDFLARE_EDGE_CIDRS", edges)
	t.Setenv("CANVAS_EDGE_ORIGIN_SECRET", secret)
	router := gin.New()
	require.NoError(t, ConfigureTrustedProxies(router))
	require.NoError(t, ConfigureEdgeRealIP(router))
	router.GET("/client-ip", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP()+"|"+c.GetHeader(EdgeOriginAuthHeader))
	})
	return router
}

func requestClientIPWithHeaders(router http.Handler, remoteAddr string, headers map[string]string) string {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/client-ip", nil)
	request.RemoteAddr = remoteAddr
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	router.ServeHTTP(recorder, request)
	clientIP, secretSeen, _ := strings.Cut(recorder.Body.String(), "|")
	if secretSeen != "" {
		return "secret reached the handler"
	}
	return clientIP
}

func TestEdgeRealIPUsesConnectingIPOnlyFromCloudflareEdges(t *testing.T) {
	router := newEdgeClientIPRouter(t, testCloudflareEdges, testEdgeOriginSecret)

	testCases := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
		expected   string
	}{
		{
			name:       "edge behind the private proxy",
			remoteAddr: "172.18.0.9:443",
			headers:    map[string]string{"X-Forwarded-For": "173.245.48.1", "CF-Connecting-IP": "203.0.113.7"},
			expected:   "203.0.113.7",
		},
		{
			name:       "IPv6 edge and visitor",
			remoteAddr: "172.18.0.9:443",
			headers:    map[string]string{"X-Forwarded-For": "2606:4700::1", "CF-Connecting-IP": "2001:db8::7"},
			expected:   "2001:db8::7",
		},
		{
			name:       "edge connected directly",
			remoteAddr: "173.245.48.1:443",
			headers:    map[string]string{"CF-Connecting-IP": "203.0.113.7"},
			expected:   "203.0.113.7",
		},
		{
			name:       "request bypassing Cloudflare keeps its address",
			remoteAddr: "172.18.0.9:443",
			headers:    map[string]string{"X-Forwarded-For": "198.51.100.9", "CF-Connecting-IP": "203.0.113.7"},
			expected:   "198.51.100.9",
		},
		{
			name:       "invalid visitor keeps the edge",
			remoteAddr: "172.18.0.9:443",
			headers:    map[string]string{"X-Forwarded-For": "173.245.48.1", "CF-Connecting-IP": "203.0.113.7, 198.51.100.1"},
			expected:   "173.245.48.1",
		},
		{
			name:       "internal caller forwarding a visitor address",
			remoteAddr: "172.18.0.4:51000",
			headers:    map[string]string{"X-Forwarded-For": "203.0.113.8"},
			expected:   "203.0.113.8",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, requestClientIPWithHeaders(router, testCase.remoteAddr, testCase.headers))
		})
	}
}

func TestEdgeRealIPUsesEdgeOneConnectingIPOnlyWithTheOriginSecret(t *testing.T) {
	router := newEdgeClientIPRouter(t, testCloudflareEdges, testEdgeOriginSecret)
	edgeOne := "43.168.152.25"

	testCases := []struct {
		name     string
		headers  map[string]string
		expected string
	}{
		{
			name:     "EdgeOne with the secret",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, EdgeOriginAuthHeader: testEdgeOriginSecret, "EO-Connecting-IP": "203.0.113.7"},
			expected: "203.0.113.7",
		},
		{
			name:     "IPv4-mapped visitor",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, EdgeOriginAuthHeader: testEdgeOriginSecret, "EO-Connecting-IP": "::ffff:203.0.113.7"},
			expected: "203.0.113.7",
		},
		{
			name:     "direct request naming a visitor without the secret",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, "EO-Connecting-IP": "203.0.113.7"},
			expected: edgeOne,
		},
		{
			name:     "wrong secret",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, EdgeOriginAuthHeader: testEdgeOriginSecret + "x", "EO-Connecting-IP": "203.0.113.7"},
			expected: edgeOne,
		},
		{
			// EdgeOne passes client-sent EO-Client-IP, CF-Connecting-IP and True-Client-IP through unchanged.
			name:     "headers EdgeOne does not overwrite",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, EdgeOriginAuthHeader: testEdgeOriginSecret, "EO-Client-IP": "203.0.113.8", "CF-Connecting-IP": "203.0.113.9", "True-Client-IP": "203.0.113.10"},
			expected: edgeOne,
		},
		{
			name:     "invalid visitor keeps the edge",
			headers:  map[string]string{"X-Forwarded-For": edgeOne, EdgeOriginAuthHeader: testEdgeOriginSecret, "EO-Connecting-IP": "not-an-ip"},
			expected: edgeOne,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, requestClientIPWithHeaders(router, "172.18.0.9:443", testCase.headers))
		})
	}
}

func TestEdgeRealIPRefusesPublicRequestsThatBypassBothEdges(t *testing.T) {
	router := newEdgeClientIPRouter(t, testCloudflareEdges, testEdgeOriginSecret)
	status := func(headers map[string]string) int {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/client-ip", nil)
		request.RemoteAddr = "172.18.0.9:443"
		for name, value := range headers {
			request.Header.Set(name, value)
		}
		router.ServeHTTP(recorder, request)
		return recorder.Code
	}
	traefik := "d42c34e2b08b"

	assert.Equal(t, http.StatusOK, status(map[string]string{"X-Forwarded-Server": traefik, "X-Forwarded-For": "43.168.152.25", EdgeOriginAuthHeader: testEdgeOriginSecret}))
	assert.Equal(t, http.StatusOK, status(map[string]string{"X-Forwarded-Server": traefik, "X-Forwarded-For": "173.245.48.1", "CF-Connecting-IP": "203.0.113.7"}))
	// Someone else's EdgeOne site, or a direct client: public, neither edge.
	assert.Equal(t, http.StatusForbidden, status(map[string]string{"X-Forwarded-Server": traefik, "X-Forwarded-For": "43.168.152.25"}))
	assert.Equal(t, http.StatusForbidden, status(map[string]string{"X-Forwarded-Server": traefik, "X-Forwarded-For": "43.168.152.25", EdgeOriginAuthHeader: "wrong", "EO-Connecting-IP": "203.0.113.7"}))
	// Internal callers such as Canvas Cloud forward a visitor address but never pass through Traefik.
	assert.Equal(t, http.StatusOK, status(map[string]string{"X-Forwarded-For": "203.0.113.8"}))
	assert.Equal(t, "203.0.113.8", requestClientIPWithHeaders(router, "172.18.0.4:51000", map[string]string{"X-Forwarded-For": "203.0.113.8"}))
}

func TestEdgeRealIPWithoutSecretAdmitsEveryRequest(t *testing.T) {
	router := newEdgeClientIPRouter(t, testCloudflareEdges, "")
	assert.Equal(t, "198.51.100.9", requestClientIPWithHeaders(router, "172.18.0.9:443", map[string]string{"X-Forwarded-Server": "d42c34e2b08b", "X-Forwarded-For": "198.51.100.9"}))
}

func TestEdgeRealIPWithoutSecretIgnoresEdgeOneHeaders(t *testing.T) {
	router := newEdgeClientIPRouter(t, testCloudflareEdges, "")

	clientIP := requestClientIPWithHeaders(router, "172.18.0.9:443", map[string]string{"X-Forwarded-For": "43.168.152.25", EdgeOriginAuthHeader: "", "EO-Connecting-IP": "203.0.113.7"})
	assert.Equal(t, "43.168.152.25", clientIP)
}

func TestEdgeRealIPUnsetKeepsClientIPResolution(t *testing.T) {
	router := newEdgeClientIPRouter(t, "", "")

	clientIP := requestClientIPWithHeaders(router, "172.18.0.9:443", map[string]string{"X-Forwarded-For": "173.245.48.1", "CF-Connecting-IP": "203.0.113.7"})
	assert.Equal(t, "173.245.48.1", clientIP)
}

func TestConfigureEdgeRealIPRejectsInvalidRanges(t *testing.T) {
	t.Setenv("CLOUDFLARE_EDGE_CIDRS", "173.245.48.0/20,not-a-range")
	assert.ErrorContains(t, ConfigureEdgeRealIP(gin.New()), "invalid CLOUDFLARE_EDGE_CIDRS entry \"not-a-range\"")
}
