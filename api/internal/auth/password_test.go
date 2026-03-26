package auth_test

import (
	"testing"

	"github.com/milmil/api/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := auth.HashPassword("hunter2")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NoError(t, auth.CheckPassword(hash, "hunter2"))
}

func TestCheckPassword_Wrong(t *testing.T) {
	hash, _ := auth.HashPassword("hunter2")
	assert.Error(t, auth.CheckPassword(hash, "wrongpassword"))
}
