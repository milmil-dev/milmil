package confirm

import (
	"bytes"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAskYN_AcceptsYAndYes(t *testing.T) {
	for _, in := range []string{"y\n", "Y\n", "yes\n", "Yes\n", " yes \n"} {
		var prompt bytes.Buffer
		require.True(t, AskYNFrom(strings.NewReader(in), &prompt, "ok?"), "input=%q", in)
		require.Contains(t, prompt.String(), "ok? [y/N]:")
	}
}

func TestAskYN_RejectsAnythingElse(t *testing.T) {
	for _, in := range []string{"\n", "n\n", "no\n", "yeah\n", "1\n"} {
		var prompt bytes.Buffer
		require.False(t, AskYNFrom(strings.NewReader(in), &prompt, "ok?"), "input=%q", in)
	}
}

func TestAskYN_ReturnsFalseOnEOF(t *testing.T) {
	var prompt bytes.Buffer
	require.False(t, AskYNFrom(strings.NewReader(""), &prompt, "ok?"))
}
