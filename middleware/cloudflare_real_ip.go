package middleware

import (
	"fmt"
	"net/netip"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// ConfigureCloudflareRealIP makes c.ClientIP() return the visitor address when a request arrives through Cloudflare.
//
// CLOUDFLARE_EDGE_CIDRS lists Cloudflare's published edge ranges. After the trusted-proxy rules resolve the client, a
// client inside those ranges is a Cloudflare edge, and only then is CF-Connecting-IP used. A request that bypasses
// Cloudflare keeps its own address whatever headers it sends. The visitor address replaces RemoteAddr, as a reverse
// proxy's real-IP module does, so no client header is rewritten. Unset leaves client IP resolution unchanged.
//
// It must run before routes are registered, because gin binds middleware to a route when the route is added.
func ConfigureCloudflareRealIP(engine *gin.Engine) error {
	rawEdges := strings.TrimSpace(os.Getenv("CLOUDFLARE_EDGE_CIDRS"))
	if rawEdges == "" {
		return nil
	}

	edges := make([]netip.Prefix, 0)
	for _, part := range strings.Split(rawEdges, ",") {
		entry := strings.TrimSpace(part)
		if entry == "" {
			continue
		}
		edge, err := netip.ParsePrefix(entry)
		if err != nil {
			return fmt.Errorf("invalid CLOUDFLARE_EDGE_CIDRS entry %q: %w", entry, err)
		}
		edges = append(edges, edge.Masked())
	}

	engine.Use(func(c *gin.Context) {
		if visitor, ok := cloudflareVisitor(c, edges); ok {
			c.Request.RemoteAddr = netip.AddrPortFrom(visitor, 0).String()
		}
		c.Next()
	})
	return nil
}

func cloudflareVisitor(c *gin.Context, edges []netip.Prefix) (netip.Addr, bool) {
	peer, err := netip.ParseAddr(c.ClientIP())
	if err != nil {
		return netip.Addr{}, false
	}
	peer = peer.Unmap()
	fromEdge := false
	for _, edge := range edges {
		if edge.Contains(peer) {
			fromEdge = true
			break
		}
	}
	if !fromEdge {
		return netip.Addr{}, false
	}

	visitor, err := netip.ParseAddr(strings.TrimSpace(c.GetHeader("CF-Connecting-IP")))
	if err != nil || visitor.Zone() != "" {
		return netip.Addr{}, false
	}
	return visitor.Unmap(), true
}
