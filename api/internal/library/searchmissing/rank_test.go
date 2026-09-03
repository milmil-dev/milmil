package searchmissing

import (
	"testing"

	"github.com/milmil/api/internal/matcher/fileparse"
)

func r(title string, seeders int, sizeBytes int64) Result {
	return Result{
		Title:     title,
		Seeders:   seeders,
		SizeBytes: sizeBytes,
		Parsed:    fileparse.Parse(title),
	}
}

func seedOrder(rs []Result) []int {
	out := make([]int, len(rs))
	for i, r := range rs {
		out[i] = r.Seeders
	}
	return out
}

func TestRank_DeadTorrentsLast(t *testing.T) {
	in := []Result{
		r("[SubsPlease] Show - 01 [1080p].mkv", 0, 1_000_000_000),
		r("[SubsPlease] Show - 01 [720p].mkv", 5, 500_000_000),
	}
	out := Rank(in)
	if out[0].Seeders != 5 {
		t.Fatalf("expected alive 720p first, got seeders=%v", seedOrder(out))
	}
	if out[1].Seeders != 0 {
		t.Fatalf("expected dead last, got seeders=%v", seedOrder(out))
	}
}

func TestRank_ResolutionBeatsSeeders(t *testing.T) {
	in := []Result{
		r("[SubsPlease] Show - 01 [720p].mkv", 100, 500_000_000),
		r("[SubsPlease] Show - 01 [1080p].mkv", 10, 1_000_000_000),
	}
	out := Rank(in)
	if out[0].Parsed.Resolution != 1080 {
		t.Fatalf("expected 1080p first, got resolution=%d", out[0].Parsed.Resolution)
	}
}

func TestRank_SeedersTiebreakAtSameResolution(t *testing.T) {
	in := []Result{
		r("[SubsPlease] Show - 01 [1080p].mkv", 10, 1_000_000_000),
		r("[SubsPlease] Show - 01 [1080p] v2.mkv", 50, 1_000_000_000),
	}
	out := Rank(in)
	if out[0].Seeders != 50 {
		t.Fatalf("expected 50-seeder first, got %v", seedOrder(out))
	}
}

func TestRank_SizeTiebreak(t *testing.T) {
	in := []Result{
		r("[SubsPlease] Show - 01 [1080p] a.mkv", 10, 1_000_000_000),
		r("[SubsPlease] Show - 01 [1080p] b.mkv", 10, 2_000_000_000),
	}
	out := Rank(in)
	if out[0].SizeBytes != 2_000_000_000 {
		t.Fatalf("expected bigger first, got size=%d", out[0].SizeBytes)
	}
}

func TestRank_SubgroupTiebreak(t *testing.T) {
	in := []Result{
		{Title: "Show - 01 [1080p].mkv", Seeders: 10, SizeBytes: 1_000_000_000, Parsed: fileparse.ParsedFilename{Resolution: 1080, SubGroup: ""}},
		{Title: "[SubsPlease] Show - 01 [1080p].mkv", Seeders: 10, SizeBytes: 1_000_000_000, Parsed: fileparse.ParsedFilename{Resolution: 1080, SubGroup: "SubsPlease"}},
	}
	out := Rank(in)
	if out[0].Parsed.SubGroup == "" {
		t.Fatalf("expected subgroup first, got empty")
	}
}
