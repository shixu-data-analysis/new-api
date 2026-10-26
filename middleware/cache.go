package middleware

import (
	"github.com/gin-gonic/gin"
)

// Cache sets the web assets' cache policy. The index page is revalidated on every load, with or without a query string, so a
// new release never serves a stale page that names hashed assets the release no longer has; the hashed assets keep a week.
func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		if path := c.Request.URL.Path; path == "/" || path == "/index.html" {
			c.Header("Cache-Control", "no-cache")
		} else {
			c.Header("Cache-Control", "max-age=604800") // one week
		}
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
