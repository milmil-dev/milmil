package searchmissing

import (
	"context"
	"testing"
	"time"

	"github.com/milmil/api/internal/torrent"
)

func TestParseSize(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"", 0},
		{"500 MB", 500_000_000},
		{"1.5 GiB", int64(1.5 * 1024 * 1024 * 1024)},
		{"2GB", 2_000_000_000},
		{"1024", 1024},
		{"garbage", 0},
	}
	for _, c := range cases {
		got := parseSizeBytes(c.in)
		if got != c.want {
			t.Errorf("parseSizeBytes(%q)=%d want %d", c.in, got, c.want)
		}
	}
}

func TestBuildQuery(t *testing.T) {
	got := buildQuery("  My Show  ", 3)
	want := "My Show 03"
	if got != want {
		t.Fatalf("buildQuery: got %q want %q", got, want)
	}
}

type stubProvider struct {
	name    string
	results []torrent.SearchResult
}

func (s *stubProvider) Name() string { return s.name }
func (s *stubProvider) Search(ctx context.Context, query string) ([]torrent.SearchResult, error) {
	return s.results, nil
}

func TestSearch_DedupesAndRanks(t *testing.T) {
	reg := torrent.NewRegistry()
	reg.Register(&stubProvider{
		name: "nyaa",
		results: []torrent.SearchResult{
			{Title: "[SubsPlease] Show - 01 [1080p].mkv", InfoHash: "aaa", Size: "1.3 GiB", Seeders: 50, SourceSite: "nyaa", PublishDate: time.Now()},
			{Title: "[SubsPlease] Show - 01 [720p].mkv", InfoHash: "bbb", Size: "600 MB", Seeders: 10, SourceSite: "nyaa", PublishDate: time.Now()},
		},
	})
	reg.Register(&stubProvider{
		name: "mikan",
		results: []torrent.SearchResult{
			// Duplicate of nyaa's 1080p by info_hash (uppercase to test case-insensitive match).
			{Title: "[SubsPlease] Show - 01 [1080p] mirror.mkv", InfoHash: "AAA", Size: "1.3 GiB", Seeders: 50, SourceSite: "mikan", PublishDate: time.Now()},
			// Dead torrent.
			{Title: "[RandomGrp] Show - 01 [1080p].mkv", InfoHash: "ccc", Size: "1.4 GiB", Seeders: 0, SourceSite: "mikan", PublishDate: time.Now()},
		},
	})

	agg := NewAggregator(reg)
	results, err := agg.Search(context.Background(), "Show", 1)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	// 4 input -> 1 dup removed -> 3 results.
	if len(results) != 3 {
		t.Fatalf("expected 3 deduped results, got %d", len(results))
	}
	// Best should be the alive 1080p with 50 seeders. Dedupe keeps whichever
	// copy arrived first from the parallel fanout (hash "aaa"/"AAA"), so the
	// top result must be the surviving dup — resolution 1080, seeders 50.
	if results[0].Parsed.Resolution != 1080 || results[0].Seeders != 50 {
		t.Fatalf("expected top result 1080p/50 seeders, got res=%d seeders=%d title=%q",
			results[0].Parsed.Resolution, results[0].Seeders, results[0].Title)
	}
	topHash := results[0].InfoHash
	if topHash != "aaa" && topHash != "AAA" {
		t.Fatalf("expected top hash to be the aaa-duplicate, got %q", topHash)
	}
	// Dead one should be last.
	if results[len(results)-1].Seeders != 0 {
		t.Fatalf("expected dead last, got seeders=%d", results[len(results)-1].Seeders)
	}
}
