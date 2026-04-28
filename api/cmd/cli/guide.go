package main

import (
	_ "embed"
	"fmt"

	"github.com/spf13/cobra"
)

//go:embed agents_guide.md
var embeddedAgentsGuide string

var agentsGuideCmd = &cobra.Command{
	Use:   "agents-guide",
	Short: "Print the AI agent usage guide for milmil",
	Long: `Prints an embedded markdown guide for AI agents controlling a
running milmil server. The content is baked into the binary at build
time, so it works offline and always matches the CLI version it ships
with.

Pipe into a pager for comfort: 'milmil agents-guide | less'.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Print(embeddedAgentsGuide)
	},
}

func init() { rootCmd.AddCommand(agentsGuideCmd) }
