package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const usernameAtNotAllowedMessage = "用户名不能包含 @"

func performUsernameRuleRequest(t *testing.T, handler gin.HandlerFunc, method string, body string, userID int, username string) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, "/api/user", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("Accept-Language", "zh-CN")
	c.Set("id", userID)
	c.Set("role", common.RoleRootUser)
	c.Set("username", username)
	handler(c)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response.Message
}

func TestUsernameWritePathsRejectAtSign(t *testing.T) {
	require.NoError(t, i18n.Init())
	db := setupManageUserTestDB(t)
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "plain-user", Password: "stored-hash", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.User{Id: 2, Username: "legacy@example.test", Password: "stored-hash", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "legacy"}).Error)

	t.Run("admin create", func(t *testing.T) {
		message := performUsernameRuleRequest(t, CreateUser, http.MethodPost, `{"username":"new@example.test","password":"password123"}`, 9999, "root-operator")
		assert.Equal(t, usernameAtNotAllowedMessage, message)

		var count int64
		require.NoError(t, db.Model(&model.User{}).Where("username = ?", "new@example.test").Count(&count).Error)
		assert.Zero(t, count)
	})

	t.Run("admin rename", func(t *testing.T) {
		message := performUsernameRuleRequest(t, UpdateUser, http.MethodPut, `{"id":1,"username":"renamed@example.test"}`, 9999, "root-operator")
		assert.Equal(t, usernameAtNotAllowedMessage, message)

		var stored model.User
		require.NoError(t, db.First(&stored, 1).Error)
		assert.Equal(t, "plain-user", stored.Username)
	})

	t.Run("admin edit keeps legacy username", func(t *testing.T) {
		message := performUsernameRuleRequest(t, UpdateUser, http.MethodPut, `{"id":2,"username":"legacy@example.test","display_name":"Legacy admin"}`, 9999, "root-operator")
		assert.NotEqual(t, usernameAtNotAllowedMessage, message)

		var stored model.User
		require.NoError(t, db.First(&stored, 2).Error)
		assert.Equal(t, "Legacy admin", stored.DisplayName)
	})

	t.Run("self rename", func(t *testing.T) {
		message := performUsernameRuleRequest(t, UpdateSelf, http.MethodPut, `{"username":"renamed@example.test"}`, 1, "plain-user")
		assert.Equal(t, usernameAtNotAllowedMessage, message)

		var stored model.User
		require.NoError(t, db.First(&stored, 1).Error)
		assert.Equal(t, "plain-user", stored.Username)
	})

	t.Run("self edit keeps legacy username", func(t *testing.T) {
		message := performUsernameRuleRequest(t, UpdateSelf, http.MethodPut, `{"username":"legacy@example.test","display_name":"Legacy self"}`, 2, "legacy@example.test")
		assert.NotEqual(t, usernameAtNotAllowedMessage, message)

		var stored model.User
		require.NoError(t, db.First(&stored, 2).Error)
		assert.Equal(t, "Legacy self", stored.DisplayName)
	})
}
