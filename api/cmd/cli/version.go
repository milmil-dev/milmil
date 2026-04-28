package main

import (
	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print CLI version",
	Run: func(cmd *cobra.Command, args []string) {
		output.Printf(Version)
	},
}

func init() { rootCmd.AddCommand(versionCmd) }
