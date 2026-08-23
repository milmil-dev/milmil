package sync

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/store"
)

// DeriveStatus computes milmil's canonical status for (user, anime).
//
// Precedence:
//  1. anime.watch_status_override, if non-empty, wins unconditionally.
//  2. Otherwise derive from completed-episode counts vs total episodes,
//     with a "repeating" bump when the most recent watch happened after the
//     series was completed — that is, after the last of its episodes was
//     marked complete.
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
	lastPlayed := asString(counts.LastPlayedAt)
	seriesCompleted := asString(counts.SeriesCompletedAt)

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
		// Compare against when the series finished, not when its first episode
		// did. The query used to take MIN over completed episodes, so any
		// series watched across more than one instant — every real one — had
		// lastPlayed after it and reported "repeating" the first time it was
		// finished, which is what got pushed to AniList, Bangumi and Trakt.
		//
		// Note this makes derived "repeating" nearly unreachable: restarting an
		// episode clears its completed flag, which drops the count below total
		// and lands on StatusWatching instead. The schema records no rewatch
		// count, so a real "currently rewatching" signal needs either that
		// column or an explicit watch_status_override. Reporting completed
		// series as completed is the correct half of the trade.
		if lastPlayed > seriesCompleted {
			return StatusRepeating, nil
		}
		return StatusCompleted, nil
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
