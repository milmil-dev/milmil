// Package output renders command results either as JSON (for agents) or
// as human-readable text/tables. Subcommands check the global --json flag
// and call the matching helper.
package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// PrintJSON writes v to stdout as indented JSON.
func PrintJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// Printf writes a formatted line to stdout. Used for human-readable output.
func Printf(format string, args ...any) {
	fmt.Fprintf(os.Stdout, format+"\n", args...)
}

// PrintTable renders rows as an aligned text table. headers and each row
// must have the same length.
func PrintTable(w io.Writer, headers []string, rows [][]string) {
	cols := len(headers)
	widths := make([]int, cols)
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, r := range rows {
		for i, cell := range r {
			if i >= cols {
				break
			}
			if l := len(cell); l > widths[i] {
				widths[i] = l
			}
		}
	}
	writeRow := func(cells []string) {
		for i, cell := range cells {
			if i >= cols {
				break
			}
			fmt.Fprintf(w, "%-*s", widths[i]+2, cell)
		}
		fmt.Fprintln(w)
	}
	writeRow(headers)
	for _, r := range rows {
		writeRow(r)
	}
}
