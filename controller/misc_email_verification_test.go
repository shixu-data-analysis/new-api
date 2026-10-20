package controller

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSendEmailVerificationReturnsStablePublicFailures(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousDomainRestriction := common.EmailDomainRestrictionEnabled
	previousDomainWhitelist := common.EmailDomainWhitelist
	previousAliasRestriction := common.EmailAliasRestrictionEnabled
	previousSMTPServer, previousSMTPAccount, previousSMTPFrom := common.SMTPServer, common.SMTPAccount, common.SMTPFrom
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}))
	model.DB = database
	t.Cleanup(func() {
		model.DB = previousDB
		common.EmailDomainRestrictionEnabled = previousDomainRestriction
		common.EmailDomainWhitelist = previousDomainWhitelist
		common.EmailAliasRestrictionEnabled = previousAliasRestriction
		common.SMTPServer, common.SMTPAccount, common.SMTPFrom = previousSMTPServer, previousSMTPAccount, previousSMTPFrom
	})
	require.NoError(t, database.Create(&model.User{Username: "registered-user", Password: "stored-password", Email: "registered@example.test"}).Error)
	common.EmailDomainWhitelist = []string{"example.test"}
	common.SMTPServer, common.SMTPAccount, common.SMTPFrom = "", "", ""

	// Each refusal must look identical, so the answer does not reveal which rule applied.
	for _, refused := range []struct {
		name              string
		email             string
		domainRestriction bool
		aliasRestriction  bool
	}{
		{"already registered", "registered@example.test", false, false},
		{"outside domain whitelist", "new-user@other.test", true, false},
		{"alias address", "new.user@example.test", false, true},
	} {
		t.Run(refused.name, func(t *testing.T) {
			common.EmailDomainRestrictionEnabled = refused.domainRestriction
			common.EmailAliasRestrictionEnabled = refused.aliasRestriction
			response := emailVerificationRequest(t, refused.email)
			assert.Equal(t, "EMAIL_NOT_ELIGIBLE", response.Code)
			assert.Equal(t, "暂时无法向该邮箱发送验证码，请核对邮箱地址，或尝试其他邮箱。", response.Message)
		})
	}

	t.Run("delivery failure hides the mail server error", func(t *testing.T) {
		common.EmailDomainRestrictionEnabled = false
		common.EmailAliasRestrictionEnabled = false
		response := emailVerificationRequest(t, "new-user@example.test")
		assert.Equal(t, "EMAIL_DELIVERY_FAILED", response.Code)
		assert.Equal(t, "验证码发送失败，请稍后重试。", response.Message)
	})
}

func emailVerificationRequest(t *testing.T, email string) struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
} {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email="+url.QueryEscape(email), nil)
	context.Request.Header.Set("Accept-Language", "zh-CN")
	SendEmailVerification(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.False(t, response.Success)
	return response
}
