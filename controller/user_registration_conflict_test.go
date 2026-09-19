package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRegisterReturnsStableConflictCodes(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousRegisterEnabled := common.RegisterEnabled
	previousPasswordRegisterEnabled := common.PasswordRegisterEnabled
	previousEmailVerificationEnabled := common.EmailVerificationEnabled
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}))
	model.DB = database
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	t.Cleanup(func() {
		model.DB = previousDB
		common.RegisterEnabled = previousRegisterEnabled
		common.PasswordRegisterEnabled = previousPasswordRegisterEnabled
		common.EmailVerificationEnabled = previousEmailVerificationEnabled
	})

	require.NoError(t, database.Create(&model.User{
		Username: "registered-user",
		Password: "stored-password",
		Email:    "registered@example.test",
	}).Error)

	t.Run("username", func(t *testing.T) {
		common.EmailVerificationEnabled = false
		response := registerRequest(t, `{"username":"registered-user","password":"another-password"}`)
		require.Equal(t, "REGISTRATION_IDENTITY_UNAVAILABLE", response.Code)
		require.Equal(t, "注册信息不可用，请更换后重试或直接登录。", response.Message)
	})

	t.Run("email", func(t *testing.T) {
		common.EmailVerificationEnabled = true
		common.RegisterVerificationCodeWithKey("registered@example.test", "123456", common.EmailVerificationPurpose)
		response := registerRequest(t, `{"username":"new-user","password":"another-password","email":"REGISTERED@example.test","verification_code":"123456"}`)
		require.Equal(t, "REGISTRATION_IDENTITY_UNAVAILABLE", response.Code)
		require.Equal(t, "注册信息不可用，请更换后重试或直接登录。", response.Message)
	})
}

func registerRequest(t *testing.T, body string) struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
} {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", bytes.NewBufferString(body))
	context.Request.Header.Set("Accept-Language", "zh-CN")
	Register(context)
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
