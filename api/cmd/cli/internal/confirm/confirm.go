// Package confirm renders interactive y/N prompts to stderr so they don't
// pollute the stdout JSON stream that agents may pipe into jq.
package confirm

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
)

// AskYN prints "<question> [y/N]: " to stderr and returns true iff the user
// types y or yes. EOF or any other input returns false (the safe default).
func AskYN(question string) bool {
	return AskYNFrom(os.Stdin, os.Stderr, question)
}

// AskYNFrom is the testable form of AskYN with explicit reader/writer.
func AskYNFrom(in io.Reader, prompt io.Writer, question string) bool {
	fmt.Fprintf(prompt, "%s [y/N]: ", question)
	scanner := bufio.NewScanner(in)
	if !scanner.Scan() {
		return false
	}
	resp := strings.ToLower(strings.TrimSpace(scanner.Text()))
	return resp == "y" || resp == "yes"
}
