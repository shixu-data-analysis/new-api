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

// Canvas shows its own sign-in copy by these codes; the translated message stays for other clients.
func TestLoginReturnsStableFailureCodes(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousPasswordLoginEnabled := common.PasswordLoginEnabled
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}))
	model.DB = database
	common.PasswordLoginEnabled = true
	t.Cleanup(func() {
		model.DB = previousDB
		common.PasswordLoginEnabled = previousPasswordLoginEnabled
	})

	hashed, err := common.Password2Hash("stored-password")
	require.NoError(t, err)
	require.NoError(t, database.Create(&model.User{Username: "registered-user", Password: hashed, Status: common.UserStatusEnabled}).Error)

	for _, failure := range []struct {
		name string
		body string
	}{
		{"wrong password", `{"username":"registered-user","password":"wrong-password"}`},
		{"unknown user", `{"username":"missing-user","password":"stored-password"}`},
	} {
		t.Run(failure.name, func(t *testing.T) {
			response := loginRequest(t, failure.body)
			require.Equal(t, "INVALID_CREDENTIALS", response.Code)
			require.Equal(t, "用户名或密码错误，或用户已被封禁", response.Message)
		})
	}

	t.Run("password login disabled", func(t *testing.T) {
		common.PasswordLoginEnabled = false
		t.Cleanup(func() { common.PasswordLoginEnabled = true })
		response := loginRequest(t, `{"username":"registered-user","password":"stored-password"}`)
		require.Equal(t, "PASSWORD_LOGIN_DISABLED", response.Code)
		require.Equal(t, "管理员关闭了密码登录", response.Message)
	})
}

func loginRequest(t *testing.T, body string) struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
} {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/login", bytes.NewBufferString(body))
	context.Request.Header.Set("Accept-Language", "zh-CN")
	Login(context)
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
