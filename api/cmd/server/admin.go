package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/milmil/api/internal/auth"
	milmildb "github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/spf13/cobra"
)

const defaultDatabaseURL = "sqlite://data/milmil.db"

func newAdminCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:          "admin",
		Short:        "Local administration commands",
		SilenceUsage: true,
	}
	cmd.AddCommand(newResetPasswordCommand())
	return cmd
}

func newResetPasswordCommand() *cobra.Command {
	var username string
	var passwordStdin bool
	var passwordEnv string

	cmd := &cobra.Command{
		Use:   "reset-password",
		Short: "Reset a user's password from inside the server/container",
		RunE: func(cmd *cobra.Command, args []string) error {
			password, err := readResetPassword(cmd, passwordStdin, passwordEnv)
			if err != nil {
				return err
			}
			if err := resetUserPassword(cmd.Context(), username, password); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "password reset for user %q\n", username)
			return nil
		},
	}

	cmd.Flags().StringVar(&username, "username", "", "username to reset")
	cmd.Flags().BoolVar(&passwordStdin, "password-stdin", false, "read the new password from stdin")
	cmd.Flags().StringVar(&passwordEnv, "password-env", "", "read the new password from this environment variable")
	if err := cmd.MarkFlagRequired("username"); err != nil {
		panic(err)
	}
	return cmd
}

func readResetPassword(cmd *cobra.Command, passwordStdin bool, passwordEnv string) (string, error) {
	sources := 0
	if passwordStdin {
		sources++
	}
	if passwordEnv != "" {
		sources++
	}
	if sources != 1 {
		return "", errors.New("provide exactly one password source: --password-stdin or --password-env")
	}

	var password string
	if passwordStdin {
		raw, err := io.ReadAll(cmd.InOrStdin())
		if err != nil {
			return "", fmt.Errorf("read password from stdin: %w", err)
		}
		password = string(raw)
	} else {
		password = os.Getenv(passwordEnv)
		if password == "" {
			return "", fmt.Errorf("environment variable %q is empty or unset", passwordEnv)
		}
	}

	password = strings.TrimRight(password, "\r\n")
	if password == "" {
		return "", errors.New("password cannot be empty")
	}
	if err := auth.CheckPasswordStrength(password); err != nil {
		return "", err
	}
	return password, nil
}

func resetUserPassword(ctx context.Context, username string, password string) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = defaultDatabaseURL
	}

	database, err := milmildb.Open(databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer database.Close()

	queries := store.New(database)
	user, err := queries.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("user %q not found", username)
		}
		return fmt.Errorf("load user %q: %w", username, err)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := queries.UpdatePasswordHash(ctx, store.UpdatePasswordHashParams{
		ID:           user.ID,
		PasswordHash: hash,
	}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}
