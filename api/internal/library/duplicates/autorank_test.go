package duplicates

import (
	"context"
	"database/sql"
	"testing"

	"github.com/milmil/api/internal/store"
)

func TestAutoRank_SetsPreferredTopRanked(t *testing.T) {
	ctx := context.Background()
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 12)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)

	mustCreateMediaFile(t, q, "mf-720", "lib1", "a1-e1", "[Grp] Show - 01 [720p].mkv", 700)
	mustCreateMediaFile(t, q, "mf-1080", "lib1", "a1-e1", "[Grp] Show - 01 [1080p].mkv", 1100)
	mustCreateMediaFile(t, q, "mf-2160", "lib1", "a1-e1", "[Grp] Show - 01 [2160p].mkv", 4400)

	if err := AutoRank(ctx, q, "lib1"); err != nil {
		t.Fatalf("AutoRank: %v", err)
	}

	ep, err := q.GetEpisode(ctx, "a1-e1")
	if err != nil {
		t.Fatalf("GetEpisode: %v", err)
	}
	if !ep.PreferredMediaFileID.Valid || ep.PreferredMediaFileID.String != "mf-2160" {
		t.Fatalf("expected preferred=mf-2160, got valid=%v string=%q", ep.PreferredMediaFileID.Valid, ep.PreferredMediaFileID.String)
	}
	if ep.PreferredManuallySet != 0 {
		t.Fatalf("expected preferred_manually_set=0 after AutoRank, got %d", ep.PreferredManuallySet)
	}
}

func TestAutoRank_PreservesManualSet(t *testing.T) {
	ctx := context.Background()
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 12)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)

	mustCreateMediaFile(t, q, "mf-720", "lib1", "a1-e1", "[Grp] Show - 01 [720p].mkv", 700)
	mustCreateMediaFile(t, q, "mf-1080", "lib1", "a1-e1", "[Grp] Show - 01 [1080p].mkv", 1100)

	// User manually pins the LOWER-res file.
	if err := q.SetEpisodePreferredManual(ctx, store.SetEpisodePreferredManualParams{
		ID:     "a1-e1",
		FileID: sql.NullString{String: "mf-720", Valid: true},
	}); err != nil {
		t.Fatalf("SetEpisodePreferredManual: %v", err)
	}

	if err := AutoRank(ctx, q, "lib1"); err != nil {
		t.Fatalf("AutoRank: %v", err)
	}

	ep, err := q.GetEpisode(ctx, "a1-e1")
	if err != nil {
		t.Fatalf("GetEpisode: %v", err)
	}
	if ep.PreferredMediaFileID.String != "mf-720" {
		t.Fatalf("AutoRank overwrote manual pin: got %q", ep.PreferredMediaFileID.String)
	}
	if ep.PreferredManuallySet != 1 {
		t.Fatalf("expected preferred_manually_set=1, got %d", ep.PreferredManuallySet)
	}
}
