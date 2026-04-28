package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/milmil/api/cmd/cli/internal/creds"
	"github.com/milmil/api/cmd/cli/internal/httpclient"
	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

const (
	defaultServer = "http://localhost:8080"
	apiTokenPrefix = "mlml_"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authenticate against a milmil server",
}

var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Verify an API token and store it locally",
	Long: `Verifies a milmil API token by hitting /auth/me with it, then stores
the token + server URL in ~/.config/milmil/credentials with mode 0600.

Server URL and token can be supplied via --server / --token flags or
prompted interactively. Generate tokens at <server>/settings/api-tokens
or via 'milmil token create' (after this scaffold lands).`,
	RunE: func(cmd *cobra.Command, args []string) error {
		server := strings.TrimSpace(flagServer)
		if server == "" {
			fmt.Fprintf(os.Stderr, "Server URL [%s]: ", defaultServer)
			scanner := bufio.NewScanner(os.Stdin)
			scanner.Scan()
			server = strings.TrimSpace(scanner.Text())
			if server == "" {
				server = defaultServer
			}
		}
		token := strings.TrimSpace(flagToken)
		if token == "" {
			fmt.Fprint(os.Stderr, "Token (mlml_...): ")
			scanner := bufio.NewScanner(os.Stdin)
			scanner.Scan()
			token = strings.TrimSpace(scanner.Text())
		}
		if !strings.HasPrefix(token, apiTokenPrefix) {
			return fmt.Errorf("token must start with %q", apiTokenPrefix)
		}

		client := httpclient.New(server, token)
		var me struct {
			ID       string `json:"id"`
			Username string `json:"username"`
		}
		if err := client.DoJSON("GET", "/api/v1/auth/me", nil, nil, &me); err != nil {
			return fmt.Errorf("verifying token against %s: %w", server, err)
		}

		if err := creds.Save(&creds.Credentials{Server: server, Token: token}); err != nil {
			return fmt.Errorf("saving credentials: %w", err)
		}
		output.Printf("Logged in as %q to %s", me.Username, server)
		return nil
	},
}

var authStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current login state",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := creds.Load()
		if err != nil {
			if errors.Is(err, creds.ErrNotLoggedIn) {
				output.Printf("Not logged in.")
				return nil
			}
			return err
		}
		client := httpclient.New(c.Server, c.Token)
		var me struct {
			ID       string `json:"id"`
			Username string `json:"username"`
		}
		if err := client.DoJSON("GET", "/api/v1/auth/me", nil, nil, &me); err != nil {
			output.Printf("Logged in to %s — but server rejected the token: %v", c.Server, err)
			return nil
		}
		output.Printf("Logged in as %q to %s", me.Username, c.Server)
		return nil
	},
}

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove stored credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := creds.Delete(); err != nil {
			return err
		}
		output.Printf("Logged out.")
		return nil
	},
}

func init() {
	authCmd.AddCommand(authLoginCmd, authStatusCmd, authLogoutCmd)
	rootCmd.AddCommand(authCmd)
}
