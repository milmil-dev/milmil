package duplicates

import (
	"context"
	"testing"
)

func TestFindAnimeDuplicates_OnlyEpisodesWithTwoOrMoreFiles(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 12)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)
	mustCreateEpisode(t, q, "a1", "a1-e2", 2)

	// Episode 1 has two files (duplicate set).
	mustCreateMediaFile(t, q, "mf-1a", "lib1", "a1-e1", "[Grp] Show - 01 [1080p].mkv", 2_000_000_000)
	mustCreateMediaFile(t, q, "mf-1b", "lib1", "a1-e1", "Show - 01 [720p].mkv", 1_000_000_000)
	// Episode 2 has a single file (not a duplicate).
	mustCreateMediaFile(t, q, "mf-2", "lib1", "a1-e2", "Show - 02 [1080p].mkv", 1_500_000_000)

	sets, err := FindAnimeDuplicates(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("FindAnimeDuplicates: %v", err)
	}
	if len(sets) != 1 {
		t.Fatalf("expected 1 duplicate set, got %d (%+v)", len(sets), sets)
	}
	set := sets[0]
	if set.EpisodeID != "a1-e1" {
		t.Fatalf("wrong episode: %s", set.EpisodeID)
	}
	if len(set.Files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(set.Files))
	}
	// No preferred set yet → wasted_bytes is 0.
	if set.WastedBytes != 0 {
		t.Fatalf("expected 0 wasted bytes when preferred is unset, got %d", set.WastedBytes)
	}
	if set.ManuallySet {
		t.Fatalf("expected ManuallySet=false by default")
	}
}

func TestFindLibraryDuplicates_GroupsAcrossAnime(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 12)
	mustCreateAnime(t, q, "a2", "lib1", 6)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)
	mustCreateEpisode(t, q, "a2", "a2-e1", 1)

	// a1 ep1 has 2 files.
	mustCreateMediaFile(t, q, "mf-a1-1", "lib1", "a1-e1", "a1-01-1080p.mkv", 1000)
	mustCreateMediaFile(t, q, "mf-a1-2", "lib1", "a1-e1", "a1-01-720p.mkv", 500)
	// a2 ep1 has 2 files.
	mustCreateMediaFile(t, q, "mf-a2-1", "lib1", "a2-e1", "a2-01-1080p.mkv", 2000)
	mustCreateMediaFile(t, q, "mf-a2-2", "lib1", "a2-e1", "a2-01-480p.mkv", 300)

	sets, err := FindLibraryDuplicates(context.Background(), q, "lib1")
	if err != nil {
		t.Fatalf("FindLibraryDuplicates: %v", err)
	}
	if len(sets) != 2 {
		t.Fatalf("expected 2 dup sets across anime, got %d", len(sets))
	}
	seen := map[string]bool{}
	for _, s := range sets {
		seen[s.AnimeID] = true
		if s.AnimeTitle == "" {
			t.Fatalf("expected AnimeTitle to be populated for library-level dups: %+v", s)
		}
	}
	if !seen["a1"] || !seen["a2"] {
		t.Fatalf("expected both anime to appear, got %v", seen)
	}
}
