package auth_test

import (
	"testing"

	"github.com/milmil/api/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSignAndVerifyToken(t *testing.T) {
	secret := "testsecret"
	userID := "user-123"

	token, err := auth.SignToken(secret, userID)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	got, err := auth.VerifyToken(secret, token)
	require.NoError(t, err)
	assert.Equal(t, userID, got)
}

func TestVerifyToken_WrongSecret(t *testing.T) {
	token, _ := auth.SignToken("secret1", "user-123")
	_, err := auth.VerifyToken("secret2", token)
	assert.Error(t, err)
}

func TestVerifyToken_InvalidString(t *testing.T) {
	_, err := auth.VerifyToken("secret", "not.a.valid.token")
	assert.Error(t, err)
}
