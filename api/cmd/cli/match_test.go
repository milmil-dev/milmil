package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseSinceFlag_Duration(t *testing.T) {
	got, err := parseSinceFlag("1h")
	require.NoError(t, err)

	parsed, err := time.Parse(time.RFC3339, got)
	require.NoError(t, err)

	// Should be ~1h ago, within a 5s tolerance to absorb test runtime jitter.
	delta := time.Since(parsed)
	require.InDelta(t, time.Hour.Seconds(), delta.Seconds(), 5)
}

func TestParseSinceFlag_RFC3339Passthrough(t *testing.T) {
	in := "2026-04-27T10:00:00Z"
	got, err := parseSinceFlag(in)
	require.NoError(t, err)
	require.Equal(t, in, got)
}

func TestParseSinceFlag_Rejects(t *testing.T) {
	for _, bad := range []string{"", "yesterday", "1xx", "2026/04/27"} {
		_, err := parseSinceFlag(bad)
		require.Error(t, err, "input=%q", bad)
	}
}
