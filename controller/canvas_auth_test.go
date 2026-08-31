package controller

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupCanvasAuthControllerTest(t *testing.T) *model.User {
	t.Helper()
	previousDB := model.DB
	previousDatabaseType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousSessionSecret := common.SessionSecret
	previousActiveLimit := common.UserSessionActiveLimit
	previousIssuanceLimit := common.UserSessionIssuanceLimit
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuthFlow{}))
	model.DB = database
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.SessionSecret = "canvas-auth-center-test-session-secret"
	common.UserSessionActiveLimit = common.DefaultUserSessionActiveLimit
	common.UserSessionIssuanceLimit = common.DefaultUserSessionIssuanceLimit
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSessionSecret
		common.UserSessionActiveLimit = previousActiveLimit
		common.UserSessionIssuanceLimit = previousIssuanceLimit
		_ = sqlDB.Close()
	})
	user := &model.User{Username: "canvas-customer", Password: "unused", DisplayName: "Canvas Customer", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, database.Create(user).Error)
	return user
}

func TestCanvasAccessKeyEnsureDoesNotRotateExistingKey(t *testing.T) {
	user := setupCanvasAuthControllerTest(t)
	firstRecorder := httptest.NewRecorder()
	firstContext, _ := gin.CreateTestContext(firstRecorder)
	firstContext.Set("id", user.Id)
	EnsureCanvasAccessKey(firstContext)
	require.Equal(t, http.StatusOK, firstRecorder.Code)

	secondRecorder := httptest.NewRecorder()
	secondContext, _ := gin.CreateTestContext(secondRecorder)
	secondContext.Set("id", user.Id)
	EnsureCanvasAccessKey(secondContext)
	require.Equal(t, http.StatusOK, secondRecorder.Code)
	assert.Equal(t, firstRecorder.Body.String(), secondRecorder.Body.String())
	assert.Equal(t, "no-store", secondRecorder.Header().Get("Cache-Control"))
}

func TestCanvasCustomerCenterHandoffIsOneTimeAndRedirectsWithoutTicket(t *testing.T) {
	user := setupCanvasAuthControllerTest(t)
	createRecorder := httptest.NewRecorder()
	createContext, _ := gin.CreateTestContext(createRecorder)
	createContext.Set("id", user.Id)
	CreateCanvasCustomerCenterHandoff(createContext)
	require.Equal(t, http.StatusCreated, createRecorder.Code)
	var created struct {
		Success bool `json:"success"`
		Data    struct {
			Path string `json:"path"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(createRecorder.Body.Bytes(), &created))
	require.True(t, created.Success)
	handoffURL, err := url.Parse(created.Data.Path)
	require.NoError(t, err)
	require.NotEmpty(t, handoffURL.Query().Get("ticket"))

	router := gin.New()
	router.GET("/api/user/canvas/customer-center-handoff", ConsumeCanvasCustomerCenterHandoff)
	first := httptest.NewRecorder()
	router.ServeHTTP(first, httptest.NewRequest(http.MethodGet, created.Data.Path, nil))
	require.Equal(t, http.StatusSeeOther, first.Code)
	assert.Equal(t, "/canvas-cloud/overview", first.Header().Get("Location"))
	assert.NotContains(t, first.Header().Get("Location"), "ticket")
	cookies := first.Result().Cookies()
	require.NotEmpty(t, cookies)
	assert.Equal(t, service.RefreshCookieName, cookies[0].Name)
	assert.True(t, cookies[0].HttpOnly)

	replay := httptest.NewRecorder()
	router.ServeHTTP(replay, httptest.NewRequest(http.MethodGet, created.Data.Path, nil))
	assert.Equal(t, http.StatusUnauthorized, replay.Code)
}
