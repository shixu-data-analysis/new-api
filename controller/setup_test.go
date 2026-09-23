package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPostSetupAcceptsManagedRootUsernameWithinModelLimit(t *testing.T) {
	previousDB := model.DB
	previousSetup := constant.Setup
	previousSelfUseMode := operation_setting.SelfUseModeEnabled
	previousDemoSiteMode := operation_setting.DemoSiteEnabled
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Option{}, &model.Setup{}))
	model.DB = database
	constant.Setup = false
	model.InitOptionMap()
	t.Cleanup(func() {
		model.DB = previousDB
		constant.Setup = previousSetup
		operation_setting.SelfUseModeEnabled = previousSelfUseMode
		operation_setting.DemoSiteEnabled = previousDemoSiteMode
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/setup", bytes.NewBufferString(`{
		"username":"canvas-stg-root",
		"password":"test-only-password",
		"confirmPassword":"test-only-password",
		"SelfUseModeEnabled":false,
		"DemoSiteEnabled":false
	}`))
	context.Request.Header.Set("Content-Type", "application/json")
	PostSetup(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, response.Message)
	var root model.User
	require.NoError(t, database.Where("username = ?", "canvas-stg-root").First(&root).Error)
	require.Equal(t, common.RoleRootUser, root.Role)
}
