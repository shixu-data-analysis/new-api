package middleware

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CanvasInternalService admits Canvas Cloud calling over the internal network. New API faces the public internet,
// so a leaked token alone must not open these routes: a gateway always adds X-Forwarded-For, and a direct call never does.
// Without a configured token every request is refused. This token opens only these routes; New API never holds the one
// that guards Cloud's own internal routes.
func CanvasInternalService() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(os.Getenv("CANVAS_EMAIL_SERVICE_TOKEN"))
		presented := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if token == "" || subtle.ConstantTimeCompare([]byte(presented), []byte(token)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "code": "UNAUTHORIZED", "message": "invalid service token"})
			return
		}
		if c.GetHeader("X-Forwarded-For") != "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": "NOT_INTERNAL", "message": "internal routes do not accept forwarded requests"})
			return
		}
		c.Next()
	}
}
