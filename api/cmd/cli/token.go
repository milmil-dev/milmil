package main

import (
	"fmt"
	"os"

	"github.com/milmil/api/cmd/cli/internal/confirm"
	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

// apiTokenItem mirrors the server's apiTokenDTO. *string for nullable
// LastUsedAt; the rest are non-null strings.
type apiTokenItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	TokenPrefix   string  `json:"token_prefix"`
	LastUsedAt    *string `json:"last_used_at"`
	LastIP        string  `json:"last_ip"`
	LastUserAgent string  `json:"last_user_agent"`
	CreatedAt     string  `json:"created_at"`
	IsCurrent     bool    `json:"is_current"`
}

var tokenCmd = &cobra.Command{
	Use:   "token",
	Short: "Manage API tokens (one per agent + one per device)",
}

var tokenListCmd = &cobra.Command{
	Use:   "list",
	Short: "List API tokens for the current user",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var items []apiTokenItem
		if err := c.DoJSON("GET", "/api/v1/api-tokens", nil, nil, &items); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(items)
		}
		if len(items) == 0 {
			output.Printf("No API tokens.")
			return nil
		}
		rows := make([][]string, 0, len(items))
		for _, t := range items {
			name := t.Name
			if t.IsCurrent {
				name += " (current)"
			}
			lastUsed := "-"
			if t.LastUsedAt != nil {
				lastUsed = shortTime(*t.LastUsedAt)
			}
			rows = append(rows, []string{
				name,
				lastUsed,
				t.LastIP,
				t.LastUserAgent,
			})
		}
		output.PrintTable(os.Stdout,
			[]string{"Name", "Last Used", "Last IP", "Last User Agent"}, rows)
		return nil
	},
}

var tokenRevokeCmd = &cobra.Command{
	Use:   "revoke <id_or_name>",
	Short: "Revoke a token by ID or by name",
	Long: `Looks up the target token by ID first; if the input doesn't match
any ID, falls back to a case-sensitive name match. Refuses to revoke
the token currently used by this CLI session — log out and use a
different token if you want to revoke this one.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		yes, _ := cmd.Flags().GetBool("yes")
		input := args[0]

		c, err := newClient()
		if err != nil {
			return err
		}
		var items []apiTokenItem
		if err := c.DoJSON("GET", "/api/v1/api-tokens", nil, nil, &items); err != nil {
			return err
		}

		var target *apiTokenItem
		for i := range items {
			if items[i].ID == input || items[i].Name == input {
				target = &items[i]
				break
			}
		}
		if target == nil {
			return fmt.Errorf("no token matches %q (try 'milmil token list')", input)
		}
		if target.IsCurrent {
			return fmt.Errorf("refusing to revoke the token used by this session — switch credentials with 'milmil auth login' first")
		}

		if !yes {
			if !confirm.AskYN(fmt.Sprintf("Revoke token %q (%s)?", target.Name, target.ID)) {
				output.Printf("Cancelled.")
				return nil
			}
		}

		if err := c.DoJSON("DELETE", "/api/v1/api-tokens/"+target.ID, nil, nil, nil); err != nil {
			return err
		}
		output.Printf("Revoked token %q.", target.Name)
		return nil
	},
}

func init() {
	tokenRevokeCmd.Flags().Bool("yes", false, "skip confirmation prompt")
	tokenCmd.AddCommand(tokenListCmd, tokenRevokeCmd)
	rootCmd.AddCommand(tokenCmd)
}
