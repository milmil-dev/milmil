package duplicates

import (
	"context"
	"database/sql"

	"github.com/milmil/api/internal/store"
)

// AutoRank writes preferred_media_file_id for every episode in libraryID that
// has 2+ files. Episodes with preferred_manually_set = 1 are never touched —
// SetEpisodePreferredAuto guards on the flag in SQL, and we also short-circuit
// in Go to avoid an unnecessary write.
func AutoRank(ctx context.Context, q *store.Queries, libraryID string) error {
	sets, err := FindLibraryDuplicates(ctx, q, libraryID)
	if err != nil {
		return err
	}
	for _, set := range sets {
		if set.ManuallySet {
			continue
		}
		if len(set.Files) == 0 {
			continue
		}
		ranked := Rank(toRankable(set.Files))
		top := ranked[0]
		if err := q.SetEpisodePreferredAuto(ctx, store.SetEpisodePreferredAutoParams{
			ID:     set.EpisodeID,
			FileID: sql.NullString{String: top.ID, Valid: true},
		}); err != nil {
			return err
		}
	}
	return nil
}
