/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestResetPasswordUsesUserChosenPassword(t *testing.T) {
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
	})

	oldPassword, err := common.Password2Hash("old-password")
	require.NoError(t, err)
	user := &model.User{
		Username: "password-reset-user",
		Password: oldPassword,
		Email: "password-reset@example.com",
		AffCode: "reset-user",
		Status: common.UserStatusEnabled,
		Role: common.RoleCommonUser,
		Group: "default",
	}
	require.NoError(t, db.Create(user).Error)

	token := "password-reset-token"
	common.RegisterVerificationCodeWithKey(user.Email, token, common.PasswordResetPurpose)
	body, err := common.Marshal(PasswordResetRequest{
		Email: user.Email,
		Token: token,
		Password: "chosen-password",
	})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/reset", bytes.NewReader(body))
	ResetPassword(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    any  `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Nil(t, response.Data)

	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	assert.True(t, common.ValidatePasswordAndHash("chosen-password", stored.Password))
	assert.False(t, common.VerifyCodeWithKey(user.Email, token, common.PasswordResetPurpose))
	loginUser := model.User{Username: user.Username, Password: "chosen-password"}
	require.NoError(t, loginUser.ValidateAndFill())

	replayRecorder := httptest.NewRecorder()
	replayContext, _ := gin.CreateTestContext(replayRecorder)
	replayContext.Request = httptest.NewRequest(http.MethodPost, "/api/user/reset", bytes.NewReader(body))
	ResetPassword(replayContext)
	var replayResponse struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(replayRecorder.Body.Bytes(), &replayResponse))
	assert.False(t, replayResponse.Success)
}

func TestResetPasswordRejectsPasswordOutsideAccountRule(t *testing.T) {
	token := "short-password-token"
	email := "short-password@example.com"
	common.RegisterVerificationCodeWithKey(email, token, common.PasswordResetPurpose)
	body, err := common.Marshal(PasswordResetRequest{
		Email: email,
		Token: token,
		Password: "short",
	})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/reset", bytes.NewReader(body))
	ResetPassword(context)

	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.True(t, common.VerifyCodeWithKey(email, token, common.PasswordResetPurpose))
	common.DeleteKey(email, common.PasswordResetPurpose)
}
