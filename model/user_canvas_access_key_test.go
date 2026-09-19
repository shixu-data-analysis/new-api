package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnsureUserAccessTokenCreatesOnceAndReusesAcrossBindings(t *testing.T) {
	setupUserUpdateTestState(t)

	user := User{Username: "canvas-key-user", Password: "password123", DisplayName: "Canvas Key User", Role: 1, Status: 1}
	require.NoError(t, DB.Create(&user).Error)

	first, err := EnsureUserAccessToken(user.Id)
	require.NoError(t, err)
	require.Len(t, first, 32)

	second, err := EnsureUserAccessToken(user.Id)
	require.NoError(t, err)
	assert.Equal(t, first, second)

	var stored User
	require.NoError(t, DB.Select("id", "access_token").First(&stored, user.Id).Error)
	assert.Equal(t, first, stored.GetAccessToken())
}
