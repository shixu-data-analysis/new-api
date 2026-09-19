package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionRejectsRetiredFrontendTheme(t *testing.T) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/option/",
		strings.NewReader(`{"key":"theme.frontend","value":"classic"}`),
	)

	UpdateOption(context)

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"Classic 前端已移除，主题只能设置为 default"}`, response.Body.String())
}

func TestGetStatusAdvertisesDefaultDashboard(t *testing.T) {
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Equal(t, "default", payload.Data["theme"])
}

func TestGetStatusReplacesLegacyCanvasSystemName(t *testing.T) {
	previousMap := common.OptionMap
	previousName := common.SystemName
	common.OptionMap = map[string]string{}
	t.Cleanup(func() {
		common.OptionMap = previousMap
		common.SystemName = previousName
	})

	tests := []struct {
		name       string
		systemName string
		want       string
	}{
		{name: "simplified Chinese legacy name", systemName: "灵猫工坊", want: "像素喵片场"},
		{name: "English legacy name", systemName: "LingCat Studio", want: "PixMiao Studio"},
		{name: "upstream technical identity", systemName: "New API", want: "New API"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			common.SystemName = tt.systemName
			response := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(response)
			context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

			GetStatus(context)

			var payload struct {
				Success bool           `json:"success"`
				Data    map[string]any `json:"data"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
			assert.True(t, payload.Success)
			assert.Equal(t, tt.want, payload.Data["system_name"])
		})
	}
}
