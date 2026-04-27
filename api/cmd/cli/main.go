// Command milmil is the milmil server's CLI client.
//
// Designed for both human admins and AI agents. Agents should prefer
// --json output and consult `milmil agents-guide` for usage recipes.
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

const Version = "0.1.0-dev"

// Persistent flags shared by every subcommand. They override values loaded
// from ~/.config/milmil/credentials and the MILMIL_SERVER/MILMIL_TOKEN env
// vars.
var (
	flagServer string
	flagToken  string
	flagJSON   bool
	flagDryRun bool
)

var rootCmd = &cobra.Command{
	Use:   "milmil",
	Short: "Self-hosted anime media server CLI",
	Long: `milmil — control milmil from the terminal.

  TIP: AI agents — run 'milmil agents-guide' for usage recipes designed
  for autonomous use, and 'milmil generate-skill --format <fmt>' to emit
  a per-format skill file.`,
	SilenceUsage: true,
}

func main() {
	rootCmd.PersistentFlags().StringVar(&flagServer, "server", "",
		"milmil server URL (default: ~/.config/milmil/credentials → MILMIL_SERVER env)")
	rootCmd.PersistentFlags().StringVar(&flagToken, "token", "",
		"API token (default: ~/.config/milmil/credentials → MILMIL_TOKEN env)")
	rootCmd.PersistentFlags().BoolVar(&flagJSON, "json", false,
		"emit JSON instead of human-readable text")
	rootCmd.PersistentFlags().BoolVar(&flagDryRun, "dry-run", false,
		"preview changes without executing")

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
