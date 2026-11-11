package controller

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

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

// Exactly one of To and UserID names the recipient. With UserID New API reads the user's address itself, so Canvas Cloud
// mails customers without ever holding their addresses.
type canvasInternalEmailRequest struct {
	To      string `json:"to"`
	UserID  *int   `json:"userId"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

// canvasMaskedAddress is what Canvas Cloud may keep of an address: the first character and the domain.
func canvasMaskedAddress(address string) string {
	at := strings.LastIndex(address, "@")
	if at < 1 {
		return "***"
	}
	first, _ := utf8.DecodeRuneInString(address)
	return string(first) + "***" + address[at:]
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
	oneRecipient := (request.To == "") != (request.UserID == nil)
	if !validSubject || !validContent || !oneRecipient || (request.UserID != nil && *request.UserID <= 0) {
		canvasEmailFailure(c, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	receiver := request.To
	if request.UserID != nil {
		address, err := model.GetUserEmail(*request.UserID)
		if err != nil {
			common.SysError(fmt.Sprintf("failed to read the address of user %d for a canvas email: %s", *request.UserID, err.Error()))
			canvasEmailFailure(c, http.StatusInternalServerError, "EMAIL_ADDRESS_UNREADABLE")
			return
		}
		if strings.TrimSpace(address) == "" {
			canvasEmailFailure(c, http.StatusUnprocessableEntity, "EMAIL_ADDRESS_MISSING")
			return
		}
		receiver = strings.TrimSpace(address)
	}
	// SendEmail reads ";" as several recipients.
	if strings.ContainsAny(receiver, ";,\r\n") || common.Validate.Var(receiver, "required,email") != nil {
		if request.UserID != nil {
			canvasEmailFailure(c, http.StatusUnprocessableEntity, "EMAIL_ADDRESS_MISSING")
			return
		}
		canvasEmailFailure(c, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	if common.SMTPServer == "" {
		canvasEmailFailure(c, http.StatusServiceUnavailable, "EMAIL_NOT_CONFIGURED")
		return
	}

	brandedSubject := fmt.Sprintf("【%s】%s", common.NormalizeSystemName(common.SystemName), subject)
	if err := common.SendEmail(brandedSubject, receiver, request.HTML); err != nil {
		// SMTP errors can name the mail host or account, so they stay in the server log.
		common.SysError(fmt.Sprintf("failed to send canvas email to %s: %s", common.MaskEmail(receiver), err.Error()))
		canvasEmailFailure(c, http.StatusBadGateway, "EMAIL_DELIVERY_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "addressMasked": canvasMaskedAddress(receiver)})
}
