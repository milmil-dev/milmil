package searchmissing

import "testing"

func TestDedupe_ByInfoHashAcrossProviders(t *testing.T) {
	in := []Raw{
		{Title: "A", InfoHash: "abc123", Provider: "nyaa"},
		{Title: "A mirror", InfoHash: "ABC123", Provider: "mikan"},
		{Title: "B", InfoHash: "def456", Provider: "dmhy"},
	}
	out := Dedupe(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 results, got %d", len(out))
	}
	if out[0].Provider != "nyaa" {
		t.Fatalf("expected first kept from nyaa, got %s", out[0].Provider)
	}
}

func TestDedupe_FallbackTitleSizeWhenHashMissing(t *testing.T) {
	in := []Raw{
		{Title: "[SubsPlease] Show - 01 [1080p].mkv", SizeBytes: 1_000_000_000},
		{Title: "[SubsPlease] Show - 01 [1080p].mkv", SizeBytes: 1_000_000_000},
		{Title: "[SubsPlease] Show - 02 [1080p].mkv", SizeBytes: 1_000_000_000},
	}
	out := Dedupe(in)
	if len(out) != 2 {
		t.Fatalf("expected 2, got %d", len(out))
	}
}

func TestDedupe_HashWinsWhenMixed(t *testing.T) {
	in := []Raw{
		{Title: "Same Title", SizeBytes: 1_000, InfoHash: "aaa"},
		{Title: "Same Title", SizeBytes: 1_000, InfoHash: "bbb"},
	}
	out := Dedupe(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 (different hashes), got %d", len(out))
	}
}
