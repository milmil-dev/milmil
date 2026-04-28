package main

import (
	"embed"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/spf13/cobra"
)

//go:embed skill_templates/*.md
var skillTemplates embed.FS

// skillFormats is the list of filenames (without .md) under
// skill_templates/. Update by adding a new file there — no Go change
// needed.
func skillFormats() []string {
	entries, err := skillTemplates.ReadDir("skill_templates")
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		name := strings.TrimSuffix(e.Name(), ".md")
		if name != "" {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

var generateSkillCmd = &cobra.Command{
	Use:   "generate-skill",
	Short: "Print agent skill / rule content for a given platform",
	Long: `Emits a 3-5 line shim that tells an AI agent to run
'milmil agents-guide' before acting. Pipe into the conventional location:

  milmil generate-skill --format claude    > ~/.claude/skills/milmil.md
  milmil generate-skill --format cursor    > .cursorrules
  milmil generate-skill --format agents-md >> AGENTS.md

Adding a new format = drop a markdown file under
api/cmd/cli/skill_templates/ and rebuild — the --format flag picks it
up automatically.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		format, _ := cmd.Flags().GetString("format")
		formats := skillFormats()
		if format == "" {
			fmt.Fprintf(os.Stderr, "--format is required (available: %s)\n", strings.Join(formats, ", "))
			return fmt.Errorf("missing --format")
		}
		data, err := skillTemplates.ReadFile("skill_templates/" + format + ".md")
		if err != nil {
			return fmt.Errorf("unknown format %q (available: %s)", format, strings.Join(formats, ", "))
		}
		fmt.Print(string(data))
		return nil
	},
}

func init() {
	generateSkillCmd.Flags().String("format", "", "skill format ("+strings.Join(skillFormats(), ", ")+")")
	rootCmd.AddCommand(generateSkillCmd)
}
