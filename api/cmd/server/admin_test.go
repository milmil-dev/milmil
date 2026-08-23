package main

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/auth"
	milmildb "github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	"github.com/stretchr/testify/require"
)

func TestAdminResetPasswordWithStdin(t *testing.T) {
	dbPath := createResetPasswordTestDB(t, "admin", "Old-pass-Tr0ub4dor!!")
	t.Setenv("DATABASE_URL", "sqlite://"+dbPath)

	out, err := executeAdminCommand(t, []string{
		"reset-password",
		"--username", "admin",
		"--password-stdin",
	}, "New-pass-Tr0ub4dor!!\n")

	require.NoError(t, err)
	require.Contains(t, out, `password reset for user "admin"`)
	requirePasswordWorks(t, dbPath, "admin", "New-pass-Tr0ub4dor!!")
	requirePasswordFails(t, dbPath, "admin", "Old-pass-Tr0ub4dor!!")
}

func TestAdminResetPasswordWithEnv(t *testing.T) {
	dbPath := createResetPasswordTestDB(t, "admin", "Old-pass-Tr0ub4dor!!")
	t.Setenv("DATABASE_URL", "sqlite://"+dbPath)
	t.Setenv("MILMIL_RESET_PASSWORD", "Env-pass-Tr0ub4dor!!")

	_, err := executeAdminCommand(t, []string{
		"reset-password",
		"--username", "admin",
		"--password-env", "MILMIL_RESET_PASSWORD",
	}, "")

	require.NoError(t, err)
	requirePasswordWorks(t, dbPath, "admin", "Env-pass-Tr0ub4dor!!")
}

func TestAdminResetPasswordRejectsWeakPassword(t *testing.T) {
	dbPath := createResetPasswordTestDB(t, "admin", "Old-pass-Tr0ub4dor!!")
	t.Setenv("DATABASE_URL", "sqlite://"+dbPath)

	_, err := executeAdminCommand(t, []string{
		"reset-password",
		"--username", "admin",
		"--password-stdin",
	}, "password\n")

	require.Error(t, err)
	require.Contains(t, err.Error(), "password is too common")
	requirePasswordWorks(t, dbPath, "admin", "Old-pass-Tr0ub4dor!!")
}

func TestAdminResetPasswordRequiresKnownUser(t *testing.T) {
	dbPath := createResetPasswordTestDB(t, "admin", "Old-pass-Tr0ub4dor!!")
	t.Setenv("DATABASE_URL", "sqlite://"+dbPath)

	_, err := executeAdminCommand(t, []string{
		"reset-password",
		"--username", "missing",
		"--password-stdin",
	}, "New-pass-Tr0ub4dor!!\n")

	require.Error(t, err)
	require.Contains(t, err.Error(), `user "missing" not found`)
	requirePasswordWorks(t, dbPath, "admin", "Old-pass-Tr0ub4dor!!")
}

func executeAdminCommand(t *testing.T, args []string, stdin string) (string, error) {
	t.Helper()

	cmd := newAdminCommand()
	var out strings.Builder
	var errOut strings.Builder
	cmd.SetOut(&out)
	cmd.SetErr(&errOut)
	cmd.SetIn(strings.NewReader(stdin))
	cmd.SetArgs(args)

	err := cmd.Execute()
	return out.String() + errOut.String(), err
}

func createResetPasswordTestDB(t *testing.T, username string, password string) string {
	t.Helper()

	dbPath := t.TempDir() + "/milmil.db"
	database, err := milmildb.Open("sqlite://" + dbPath)
	require.NoError(t, err)
	defer database.Close()

	createUsersTable(t, dbPath)
	hash, err := auth.HashPassword(password)
	require.NoError(t, err)

	_, err = store.New(database).CreateUser(context.Background(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: hash,
	})
	require.NoError(t, err)

	return dbPath
}

// createUsersTable builds the schema by running the real migrations rather
// than a hand-copied CREATE TABLE. The copy silently drifted from the
// migrations every time a column was added, failing this test for a reason
// that had nothing to do with what it covers.
func createUsersTable(t *testing.T, dbPath string) {
	t.Helper()

	require.NoError(t, milmildb.MigrateUp(migrations.FS, "sqlite://"+dbPath))
}

func requirePasswordWorks(t *testing.T, dbPath string, username string, password string) {
	t.Helper()

	hash := passwordHashForUser(t, dbPath, username)
	require.NoError(t, auth.CheckPassword(hash, password))
}

func requirePasswordFails(t *testing.T, dbPath string, username string, password string) {
	t.Helper()

	hash := passwordHashForUser(t, dbPath, username)
	require.Error(t, auth.CheckPassword(hash, password))
}

func passwordHashForUser(t *testing.T, dbPath string, username string) string {
	t.Helper()

	database, err := milmildb.Open("sqlite://" + dbPath)
	require.NoError(t, err)
	defer database.Close()

	user, err := store.New(database).GetUserByUsername(context.Background(), username)
	require.NoError(t, err)
	return user.PasswordHash
}
