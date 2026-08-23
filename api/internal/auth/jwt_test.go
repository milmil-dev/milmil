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

	token, err := auth.SignToken(secret, userID, 0)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	got, version, err := auth.VerifyToken(secret, token)
	require.NoError(t, err)
	assert.Equal(t, userID, got)
	assert.Equal(t, int64(0), version)
}

// The version travels in the claims so callers can compare it against the
// user's current one; VerifyToken itself does not judge it.
func TestVerifyTokenReturnsTokenVersion(t *testing.T) {
	secret := "testsecret"

	token, err := auth.SignToken(secret, "user-123", 7)
	require.NoError(t, err)

	got, version, err := auth.VerifyToken(secret, token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", got)
	assert.Equal(t, int64(7), version)
}

func TestVerifyToken_WrongSecret(t *testing.T) {
	token, _ := auth.SignToken("secret1", "user-123", 0)
	_, _, err := auth.VerifyToken("secret2", token)
	assert.Error(t, err)
}

func TestVerifyToken_InvalidString(t *testing.T) {
	_, _, err := auth.VerifyToken("secret", "not.a.valid.token")
	assert.Error(t, err)
}
