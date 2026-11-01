package controller

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

const (
	canvasEmailMaxBodyBytes     = 256 * 1024
	canvasEmailMaxHTMLBytes     = 200 * 1024
	canvasEmailMaxSubjectChars  = 200
	canvasEmailPerMinute        = 30
	canvasEmailLimiterKey       = "canvas-internal-email"
	canvasEmailLimiterWindowSec = 60
)

var (
	canvasEmailLimiter     common.InMemoryRateLimiter
	canvasEmailLimiterOnce sync.Once
)

type canvasInternalEmailRequest struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

func canvasEmailFailure(c *gin.Context, status int, code string) {
	c.JSON(status, gin.H{"success": false, "code": code})
}

// SendCanvasInternalEmail sends one mail for Canvas Cloud, which owns the recipients and the content.
// The content is not logged. One recipient a call, so recipients never see each other's address.
func SendCanvasInternalEmail(c *gin.Context) {
	canvasEmailLimiterOnce.Do(func() { canvasEmailLimiter.Init(time.Duration(common.RateLimitKeyExpirationDuration)) })
	if !canvasEmailLimiter.Request(canvasEmailLimiterKey, canvasEmailPerMinute, canvasEmailLimiterWindowSec) {
		canvasEmailFailure(c, http.StatusTooManyRequests, "EMAIL_RATE_LIMITED")
		return
	}

	var request canvasInternalEmailRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, canvasEmailMaxBodyBytes), &request); err != nil {
		canvasEmailFailure(c, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	subject := strings.TrimSpace(request.Subject)
	validSubject := subject != "" && utf8.RuneCountInString(subject) <= canvasEmailMaxSubjectChars && !strings.ContainsAny(subject, "\r\n")
	validContent := request.HTML != "" && len(request.HTML) <= canvasEmailMaxHTMLBytes
	// SendEmail reads ";" as several recipients.
	validReceiver := !strings.ContainsAny(request.To, ";,\r\n") && common.Validate.Var(request.To, "required,email") == nil
	if !validSubject || !validContent || !validReceiver {
		canvasEmailFailure(c, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	if common.SMTPServer == "" {
		canvasEmailFailure(c, http.StatusServiceUnavailable, "EMAIL_NOT_CONFIGURED")
		return
	}

	brandedSubject := fmt.Sprintf("【%s】%s", common.NormalizeSystemName(common.SystemName), subject)
	if err := common.SendEmail(brandedSubject, request.To, request.HTML); err != nil {
		// SMTP errors can name the mail host or account, so they stay in the server log.
		common.SysError(fmt.Sprintf("failed to send canvas email to %s: %s", common.MaskEmail(request.To), err.Error()))
		canvasEmailFailure(c, http.StatusBadGateway, "EMAIL_DELIVERY_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
