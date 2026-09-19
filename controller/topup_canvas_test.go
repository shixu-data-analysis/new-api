package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCanvasRechargePurchaseURL(t *testing.T) {
	t.Run("returns empty when the runtime setting is empty", func(t *testing.T) {
		t.Setenv(canvasRechargePurchaseURLEnvironment, "")

		assert.Empty(t, canvasRechargePurchaseURL())
	})

	t.Run("trims the configured runtime URL", func(t *testing.T) {
		t.Setenv(canvasRechargePurchaseURLEnvironment, "  https://go.pixmiao.com/recharge  ")

		assert.Equal(t, "https://go.pixmiao.com/recharge", canvasRechargePurchaseURL())
	})
}
