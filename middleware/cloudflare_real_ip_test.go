package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Blank entries are skipped, as in TRUSTED_PROXIES.
const testCloudflareEdges = "173.245.48.0/20, ,2606:4700::/32,"

func newCloudflareClientIPRouter(t *testing.T, edges string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	t.Setenv("TRUSTED_PROXIES", "")
	t.Setenv("CLOUDFLARE_EDGE_CIDRS", edges)
	router := gin.New()
	require.NoError(t, ConfigureTrustedProxies(router))
	require.NoError(t, ConfigureCloudflareRealIP(router))
	router.GET("/client-ip", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
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
	return recorder.Body.String()
}

func TestCloudflareRealIPUsesConnectingIPOnlyFromCloudflareEdges(t *testing.T) {
	router := newCloudflareClientIPRouter(t, testCloudflareEdges)

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

func TestCloudflareRealIPUnsetKeepsClientIPResolution(t *testing.T) {
	router := newCloudflareClientIPRouter(t, "")

	clientIP := requestClientIPWithHeaders(router, "172.18.0.9:443", map[string]string{"X-Forwarded-For": "173.245.48.1", "CF-Connecting-IP": "203.0.113.7"})
	assert.Equal(t, "173.245.48.1", clientIP)
}

func TestConfigureCloudflareRealIPRejectsInvalidRanges(t *testing.T) {
	t.Setenv("CLOUDFLARE_EDGE_CIDRS", "173.245.48.0/20,not-a-range")
	assert.ErrorContains(t, ConfigureCloudflareRealIP(gin.New()), "invalid CLOUDFLARE_EDGE_CIDRS entry \"not-a-range\"")
}
