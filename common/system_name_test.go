package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeSystemNameKeepsCanvasBrandAndCustomNames(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "missing", want: DefaultCanvasSystemName},
		{name: "upstream default", value: "New API", want: DefaultCanvasSystemName},
		{name: "legacy Chinese", value: "灵猫工坊", want: DefaultCanvasSystemName},
		{name: "legacy Traditional Chinese", value: "靈貓工坊", want: DefaultCanvasTraditionalName},
		{name: "legacy English", value: "LingCat Studio", want: DefaultCanvasEnglishSystemName},
		{name: "custom", value: "Customer Gateway", want: "Customer Gateway"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, NormalizeSystemName(tt.value))
		})
	}
}

func TestGet2FAIssuerNormalizesRetiredBrand(t *testing.T) {
	previousName := SystemName
	t.Cleanup(func() { SystemName = previousName })
	SystemName = "New API"
	require.Equal(t, DefaultCanvasSystemName, Get2FAIssuer())
}
