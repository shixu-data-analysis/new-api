package middleware

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"net/netip"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// EdgeOriginAuthHeader carries CANVAS_EDGE_ORIGIN_SECRET from the EdgeOne entry (rule engine, "modify origin request
// header"). EdgeOne overwrites a client-sent EO-Connecting-IP with the address it accepted the connection from, but anyone
// can reach the origin directly with that header, so it is trusted only together with the secret.
const EdgeOriginAuthHeader = "X-Canvas-Origin-Auth"

// ConfigureEdgeRealIP makes c.ClientIP() return the visitor address when a request arrives through a trusted edge.
//
// CLOUDFLARE_EDGE_CIDRS lists Cloudflare's published edge ranges: after the trusted-proxy rules resolve the client, a
// client inside those ranges is a Cloudflare edge, and only then is CF-Connecting-IP used. CANVAS_EDGE_ORIGIN_SECRET is the
// EdgeOne origin secret: only a request carrying it in X-Canvas-Origin-Auth names its visitor in EO-Connecting-IP. A request
// that bypasses both edges keeps its own address whatever headers it sends. The visitor address replaces RemoteAddr, as a
// reverse proxy's real-IP module does, and the secret header is removed so no handler or relay sees it. Both unset leave
// client IP resolution unchanged.
//
// Once the secret is configured, a request that came through the public entry must also have come through one of the two
// edges, or it is refused with 403. Traefik sets X-Forwarded-Server on every request it forwards, overwriting any a client
// sends; internal callers (Canvas Cloud, health checks) do not pass through it. The EdgeOne origin ranges are shared by
// every EdgeOne site, so without this a site of someone else's pointed at the origin would bypass ours.
//
// It must run before routes are registered, because gin binds middleware to a route when the route is added.
func ConfigureEdgeRealIP(engine *gin.Engine) error {
	edges, err := cloudflareEdges(os.Getenv("CLOUDFLARE_EDGE_CIDRS"))
	if err != nil {
		return err
	}
	secret := strings.TrimSpace(os.Getenv("CANVAS_EDGE_ORIGIN_SECRET"))
	if len(edges) == 0 && secret == "" {
		return nil
	}

	engine.Use(func(c *gin.Context) {
		visitor, viaEdge, fromEdge := edgeVisitor(c, edges, secret)
		c.Request.Header.Del(EdgeOriginAuthHeader)
		if secret != "" && !fromEdge && c.GetHeader("X-Forwarded-Server") != "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"code":    "EDGE_ORIGIN_FORBIDDEN",
				"message": "requests must arrive through the Canvas edge",
			})
			return
		}
		if viaEdge {
			c.Request.RemoteAddr = netip.AddrPortFrom(visitor, 0).String()
		}
		c.Next()
	})
	return nil
}

func cloudflareEdges(raw string) ([]netip.Prefix, error) {
	edges := make([]netip.Prefix, 0)
	for _, part := range strings.Split(raw, ",") {
		entry := strings.TrimSpace(part)
		if entry == "" {
			continue
		}
		edge, err := netip.ParsePrefix(entry)
		if err != nil {
			return nil, fmt.Errorf("invalid CLOUDFLARE_EDGE_CIDRS entry %q: %w", entry, err)
		}
		edges = append(edges, edge.Masked())
	}
	return edges, nil
}

// edgeVisitor reports the visitor an edge names (and whether it named a valid one) and whether the request came from an edge
// at all: a Cloudflare peer, or the EdgeOne origin secret.
func edgeVisitor(c *gin.Context, edges []netip.Prefix, secret string) (visitor netip.Addr, named bool, fromEdge bool) {
	if secret != "" && subtle.ConstantTimeCompare([]byte(c.GetHeader(EdgeOriginAuthHeader)), []byte(secret)) == 1 {
		visitor, named = visitorFromHeader(c, "EO-Connecting-IP")
		return visitor, named, true
	}
	peer, err := netip.ParseAddr(c.ClientIP())
	if err != nil {
		return netip.Addr{}, false, false
	}
	peer = peer.Unmap()
	for _, edge := range edges {
		if edge.Contains(peer) {
			visitor, named = visitorFromHeader(c, "CF-Connecting-IP")
			return visitor, named, true
		}
	}
	return netip.Addr{}, false, false
}

func visitorFromHeader(c *gin.Context, name string) (netip.Addr, bool) {
	visitor, err := netip.ParseAddr(strings.TrimSpace(c.GetHeader(name)))
	if err != nil || visitor.Zone() != "" {
		return netip.Addr{}, false
	}
	return visitor.Unmap(), true
}
