package main

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/auth"
	milmildb "github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
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

	createUsersTable(t, database)
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

func createUsersTable(t *testing.T, database *sql.DB) {
	t.Helper()

	_, err := database.Exec(`
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    totp_secret TEXT NOT NULL DEFAULT '',
    two_factor_enabled INTEGER NOT NULL DEFAULT 0
);
`)
	require.NoError(t, err)
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
