package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/milmil/api/internal/store"
)

// DeriveStatus computes milmil's canonical status for (user, anime).
//
// Precedence:
//  1. anime.watch_status_override, if non-empty, wins unconditionally.
//  2. Otherwise derive from completed-episode counts vs total episodes,
//     with "repeating" when the series has been finished before (recorded in
//     anime_watch_state) and is being watched again.
//
// A user with any watch_progress row but zero completions is StatusPlanning;
// a user with no rows at all is StatusNone.
func DeriveStatus(ctx context.Context, q *store.Queries, userID, animeID string) (WatchStatus, error) {
	anime, err := q.GetAnime(ctx, animeID)
	if err != nil {
		return StatusNone, err
	}
	if anime.WatchStatusOverride != "" {
		return WatchStatus(anime.WatchStatusOverride), nil
	}

	counts, err := q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil {
		return StatusNone, err
	}

	completed := asInt64(counts.CompletedCount)

	if completed == 0 {
		hasProgress, err := q.HasAnyWatchProgress(ctx, store.HasAnyWatchProgressParams{
			UserID:  userID,
			AnimeID: animeID,
		})
		if err != nil {
			return StatusNone, err
		}
		if hasProgress != 0 {
			return StatusPlanning, nil
		}
		return StatusNone, nil
	}

	var total int64
	if anime.TotalEpisodes.Valid {
		total = anime.TotalEpisodes.Int64
	}
	if total > 0 && completed >= total {
		return StatusCompleted, nil
	}

	// Partway through. Whether that is a first watch or a rewatch cannot be
	// told from watch_progress alone — a half-finished episode looks identical
	// either way — so it comes from the completion the user has already
	// recorded. Deriving it from timestamps is what previously reported every
	// finished series as "repeating".
	state, err := q.GetAnimeWatchState(ctx, store.GetAnimeWatchStateParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return StatusNone, err
	}
	if state.TimesCompleted > 0 {
		return StatusRepeating, nil
	}

	return StatusWatching, nil
}

// asInt64 coerces the interface{} columns sqlc emits for COALESCE(SUM(...))
// aggregates. SQLite drivers typically return int64, but COALESCE defaults
// can surface as []byte on some paths, so we handle both.
func asInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case []byte:
		var n int64
		_, _ = fmt.Sscanf(string(x), "%d", &n)
		return n
	case string:
		var n int64
		_, _ = fmt.Sscanf(x, "%d", &n)
		return n
	case nil:
		return 0
	default:
		return 0
	}
}

// asString coerces the interface{} columns sqlc emits for COALESCE(MAX/MIN)
// on TEXT aggregates.
func asString(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", x)
	}
}

// RecordSeriesCompletion notes that (userID, animeID) is now fully watched, so
// a later partial watch can be recognised as a rewatch rather than a first
// pass.
//
// It is safe to call on every progress save: the underlying statement only
// counts a completion when the series became whole more recently than the last
// one recorded, so re-saving progress on a finished series does nothing. A
// series that is not yet complete is ignored entirely.
func RecordSeriesCompletion(ctx context.Context, q *store.Queries, userID, animeID string) error {
	anime, err := q.GetAnime(ctx, animeID)
	if err != nil {
		return err
	}
	if !anime.TotalEpisodes.Valid || anime.TotalEpisodes.Int64 <= 0 {
		return nil // unknown length; "complete" is not meaningful
	}

	counts, err := q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil {
		return err
	}
	if asInt64(counts.CompletedCount) < anime.TotalEpisodes.Int64 {
		return nil
	}

	return q.RecordSeriesCompletion(ctx, store.RecordSeriesCompletionParams{
		UserID:          userID,
		AnimeID:         animeID,
		LastCompletedAt: asString(counts.SeriesCompletedAt),
	})
}
