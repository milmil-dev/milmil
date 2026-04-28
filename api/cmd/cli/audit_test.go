package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNullString_UnmarshalsSqlNullStringShape(t *testing.T) {
	var n nullString
	require.NoError(t, json.Unmarshal([]byte(`{"String":"hello","Valid":true}`), &n))
	require.True(t, n.Valid)
	require.Equal(t, "hello", n.String)
}

func TestNullString_UnmarshalsPlainStringShape(t *testing.T) {
	var n nullString
	require.NoError(t, json.Unmarshal([]byte(`"hello"`), &n))
	require.True(t, n.Valid)
	require.Equal(t, "hello", n.String)
}

func TestNullString_UnmarshalsNull(t *testing.T) {
	var n nullString
	require.NoError(t, json.Unmarshal([]byte(`null`), &n))
	require.False(t, n.Valid)
	require.Empty(t, n.String)
}

func TestNullString_InvalidShape(t *testing.T) {
	var n nullString
	require.NoError(t, json.Unmarshal([]byte(`{"String":"","Valid":false}`), &n))
	require.False(t, n.Valid)
}

func TestNullFloat64_UnmarshalsSqlShape(t *testing.T) {
	var n nullFloat64
	require.NoError(t, json.Unmarshal([]byte(`{"Float64":0.92,"Valid":true}`), &n))
	require.True(t, n.Valid)
	require.InDelta(t, 0.92, n.Float64, 1e-9)
}

func TestNullFloat64_UnmarshalsPlainNumber(t *testing.T) {
	var n nullFloat64
	require.NoError(t, json.Unmarshal([]byte(`0.5`), &n))
	require.True(t, n.Valid)
	require.InDelta(t, 0.5, n.Float64, 1e-9)
}

func TestTargetCell(t *testing.T) {
	require.Equal(t, "file:f-1", targetCell(
		nullString{String: "file", Valid: true},
		nullString{String: "f-1", Valid: true},
	))
	require.Equal(t, "f-1", targetCell(nullString{}, nullString{String: "f-1", Valid: true}))
	require.Equal(t, "file", targetCell(nullString{String: "file", Valid: true}, nullString{}))
	require.Equal(t, "-", targetCell(nullString{}, nullString{}))
}

func TestConfidenceCell(t *testing.T) {
	require.Equal(t, "0.92", confidenceCell(nullFloat64{Float64: 0.92, Valid: true}))
	require.Equal(t, "-", confidenceCell(nullFloat64{}))
}
