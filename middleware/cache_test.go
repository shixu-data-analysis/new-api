package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestCacheRevalidatesTheIndexPageWithOrWithoutAQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Cache())
	router.NoRoute(func(c *gin.Context) { c.Status(http.StatusOK) })

	testCases := map[string]string{
		"/":                   "no-cache",
		"/?utm_source=x":      "no-cache",
		"/index.html":         "no-cache",
		"/index.html?v=2":     "no-cache",
		"/assets/app-1a2b.js": "max-age=604800",
		"/logo.png":           "max-age=604800",
	}
	for target, expected := range testCases {
		t.Run(target, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
			assert.Equal(t, expected, recorder.Header().Get("Cache-Control"))
		})
	}
}
