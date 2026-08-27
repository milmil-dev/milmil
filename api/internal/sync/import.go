package sync

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/store"
)

// runImport fetches the user's full remote list and populates milmil state
// only where milmil has no existing watch_progress for the anime. Idempotent
// by virtue of the HasAnyWatchProgress guard — a re-run is a no-op.
func (s *Service) runImport(ctx context.Context, userID string, prov Provider, tok string) error {
	entries, err := prov.FetchList(ctx, tok)
	if err != nil {
		return err
	}
	imported := 0
	for _, e := range entries {
		animeID, ok := s.lookupAnimeByProviderID(ctx, prov.Name(), e.ProviderAnimeID)
		if !ok {
			continue
		}
		has, _ := s.q.HasAnyWatchProgress(ctx, store.HasAnyWatchProgressParams{
			UserID:  userID,
			AnimeID: animeID,
		})
		if has != 0 {
			continue
		}

		episodes, err := s.q.ListEpisodesByAnimeID(ctx, animeID)
		if err != nil {
			continue
		}
		for i, ep := range episodes {
			if i >= e.Progress {
				break
			}
			_, _ = s.q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
				ID:              uuid.NewString(),
				UserID:          userID,
				EpisodeID:       ep.ID,
				Completed:       1,
				PositionSeconds: 0,
			})
		}
		if err := RecordSeriesCompletion(ctx, s.q, userID, animeID); err != nil {
			slog.Warn("sync: failed to record series completion",
				"anime_id", animeID, "user", userID, "err", err)
		}
		if e.Status == StatusDropped || e.Status == StatusPaused {
			anime, _ := s.q.GetAnime(ctx, animeID)
			_ = s.q.UpdateAnimeSyncFlags(ctx, store.UpdateAnimeSyncFlagsParams{
				ID:                  animeID,
				SyncDisabled:        anime.SyncDisabled,
				WatchStatusOverride: string(e.Status),
			})
		}
		imported++
	}
	slog.Info("sync: imported", "provider", prov.Name(), "user", userID, "count", imported)
	return nil
}

// lookupAnimeByProviderID resolves a provider-native ID to a local anime row.
// Returns ("", false) when no match exists — the import loop silently skips
// unmatched remote entries rather than failing the whole run.
func (s *Service) lookupAnimeByProviderID(ctx context.Context, p ProviderName, id int64) (string, bool) {
	if id == 0 {
		return "", false
	}
	arg := sql.NullInt64{Int64: id, Valid: true}
	switch p {
	case ProviderAniList:
		a, err := s.q.GetAnimeByAnilistID(ctx, arg)
		if err == nil {
			return a.ID, true
		}
	case ProviderBangumi:
		a, err := s.q.GetAnimeByBangumiID(ctx, arg)
		if err == nil {
			return a.ID, true
		}
	case ProviderTrakt:
		// Trakt's FetchList sets ProviderAnimeID to show.ids.tmdb (primary),
		// with the trakt numeric id as a fallback when tmdb is missing. Try
		// TMDB first — the vast majority of anime shows have a TMDB mapping —
		// then fall back to the cached trakt_show_id column.
		if a, err := s.q.GetAnimeByTMDBID(ctx, arg); err == nil {
			return a.ID, true
		}
		if a, err := s.q.GetAnimeByTraktShowID(ctx, arg); err == nil {
			return a.ID, true
		}
	}
	return "", false
}
