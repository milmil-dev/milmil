package creds

import (
	"errors"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

// withHomeDir redirects the current process's home dir lookup to a temp
// directory for the duration of the test. Necessary because creds.{Save,
// Load,Delete} all derive their path from os.UserHomeDir().
func withHomeDir(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home) // Windows fallback
	t.Setenv("MILMIL_SERVER", "")
	t.Setenv("MILMIL_TOKEN", "")
	return home
}

func TestCreds_RoundTrip(t *testing.T) {
	withHomeDir(t)

	want := &Credentials{Server: "http://localhost:8080", Token: "mlml_abc123"}
	require.NoError(t, Save(want))

	got, err := Load()
	require.NoError(t, err)
	require.Equal(t, want.Server, got.Server)
	require.Equal(t, want.Token, got.Token)
}

func TestCreds_FileMode0600(t *testing.T) {
	withHomeDir(t)

	require.NoError(t, Save(&Credentials{Server: "http://x", Token: "mlml_x"}))
	path, err := defaultPath()
	require.NoError(t, err)

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "credentials file must be 0600")
}

func TestCreds_LoadReturnsErrNotLoggedInForMissingFile(t *testing.T) {
	withHomeDir(t)

	_, err := Load()
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrNotLoggedIn), "got %v", err)
}

func TestCreds_EnvOverrideTakesPrecedence(t *testing.T) {
	withHomeDir(t)
	require.NoError(t, Save(&Credentials{Server: "http://from-file", Token: "mlml_file"}))

	t.Setenv("MILMIL_SERVER", "http://from-env")
	t.Setenv("MILMIL_TOKEN", "mlml_env")

	got, err := Load()
	require.NoError(t, err)
	require.Equal(t, "http://from-env", got.Server)
	require.Equal(t, "mlml_env", got.Token)
}

func TestCreds_DeleteIsIdempotent(t *testing.T) {
	withHomeDir(t)

	require.NoError(t, Delete(), "delete-when-absent must not error")

	require.NoError(t, Save(&Credentials{Server: "http://x", Token: "mlml_x"}))
	require.NoError(t, Delete())

	_, err := Load()
	require.True(t, errors.Is(err, ErrNotLoggedIn))
}
