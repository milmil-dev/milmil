package output

import (
	"bytes"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPrintTable_AlignsHeadersAndRows(t *testing.T) {
	var buf bytes.Buffer
	PrintTable(&buf,
		[]string{"ID", "Name", "Files"},
		[][]string{
			{"lib-001", "Anime", "42"},
			{"lib-2", "Long-Name-Library", "1234567"},
		},
	)
	out := buf.String()
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	require.Len(t, lines, 3, "header + 2 rows")

	// Each line should have the same length once rendered to a fixed-width
	// column layout (sanity check on padding).
	require.Equal(t, len(lines[0]), len(lines[1]))
	require.Equal(t, len(lines[0]), len(lines[2]))

	// Header row contains all header labels.
	for _, h := range []string{"ID", "Name", "Files"} {
		require.Contains(t, lines[0], h)
	}
	// Widest name must drive column width — second row's name is widest.
	require.Contains(t, lines[2], "Long-Name-Library")
}

func TestPrintTable_HandlesEmptyRows(t *testing.T) {
	var buf bytes.Buffer
	PrintTable(&buf, []string{"ID", "Name"}, nil)
	out := buf.String()
	require.Contains(t, out, "ID")
	require.Contains(t, out, "Name")
}
