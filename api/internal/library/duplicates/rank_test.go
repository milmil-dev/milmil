package duplicates

import (
	"testing"
	"time"
)

func TestRank_ResolutionDesc(t *testing.T) {
	files := []RankableFile{
		{ID: "a", Resolution: 720},
		{ID: "b", Resolution: 2160},
		{ID: "c", Resolution: 1080},
	}
	got := Rank(files)
	want := []string{"b", "c", "a"}
	for i, w := range want {
		if got[i].ID != w {
			t.Fatalf("position %d: got %q want %q (full=%v)", i, got[i].ID, w, got)
		}
	}
}

func TestRank_SizeTiebreakAtSameResolution(t *testing.T) {
	files := []RankableFile{
		{ID: "small", Resolution: 1080, SizeBytes: 100},
		{ID: "big", Resolution: 1080, SizeBytes: 500},
		{ID: "mid", Resolution: 1080, SizeBytes: 300},
	}
	got := Rank(files)
	want := []string{"big", "mid", "small"}
	for i, w := range want {
		if got[i].ID != w {
			t.Fatalf("position %d: got %q want %q", i, got[i].ID, w)
		}
	}
}

func TestRank_SubgroupNonEmptyBeatsEmpty(t *testing.T) {
	files := []RankableFile{
		{ID: "anon", Resolution: 1080, SizeBytes: 100, Subgroup: ""},
		{ID: "named", Resolution: 1080, SizeBytes: 100, Subgroup: "SubsPlease"},
	}
	got := Rank(files)
	if got[0].ID != "named" {
		t.Fatalf("expected named first, got %v", got)
	}
}

func TestRank_ModTimeNewestWinsWhenAllEqual(t *testing.T) {
	old := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	newer := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	files := []RankableFile{
		{ID: "old", Resolution: 1080, SizeBytes: 100, Subgroup: "g", ModTime: old},
		{ID: "new", Resolution: 1080, SizeBytes: 100, Subgroup: "g", ModTime: newer},
	}
	got := Rank(files)
	if got[0].ID != "new" {
		t.Fatalf("expected new first, got %v", got)
	}
}

func TestRank_StableOnCompleteTie(t *testing.T) {
	t0 := time.Unix(0, 0).UTC()
	files := []RankableFile{
		{ID: "first", Resolution: 1080, SizeBytes: 100, Subgroup: "g", ModTime: t0},
		{ID: "second", Resolution: 1080, SizeBytes: 100, Subgroup: "g", ModTime: t0},
		{ID: "third", Resolution: 1080, SizeBytes: 100, Subgroup: "g", ModTime: t0},
	}
	got := Rank(files)
	want := []string{"first", "second", "third"}
	for i, w := range want {
		if got[i].ID != w {
			t.Fatalf("stability broken at %d: got %q want %q", i, got[i].ID, w)
		}
	}
}

func TestRank_ZeroResolutionLowest(t *testing.T) {
	files := []RankableFile{
		{ID: "unknown", Resolution: 0, SizeBytes: 99999},
		{ID: "low", Resolution: 480, SizeBytes: 10},
	}
	got := Rank(files)
	if got[0].ID != "low" {
		t.Fatalf("expected low first (non-zero resolution wins), got %v", got)
	}
}
