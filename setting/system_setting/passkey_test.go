package system_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGetPasskeySettingsNormalizesRuntimeBrand(t *testing.T) {
	previous := defaultPasskeySettings
	t.Cleanup(func() { defaultPasskeySettings = previous })

	defaultPasskeySettings.RPDisplayName = "New API"
	require.Equal(t, common.DefaultCanvasSystemName, GetPasskeySettings().RPDisplayName)

	defaultPasskeySettings.RPDisplayName = "Customer Gateway"
	require.Equal(t, "Customer Gateway", GetPasskeySettings().RPDisplayName)
}
