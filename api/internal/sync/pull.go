package sync

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"uuid"

	"github.com/milmil/api/internal/store"
)

// PullResult summarizes the outcome of a PullFromProvider run. Exposed to the
// HTTP layer so the UI can show a human-readable toast after a manual pull.
type PullResult struct {
	Provider     ProviderName `json:"provider"`
	Checked      int          `json:"checked"`
	UpdatedLocal int          `json:"updated_local"`
	Skipped      int          `json:"skipped"`
	Errors       []string     `json:"errors"`
}

// PullFromProvider fetches the user's remote watched list and applies a
// max-wins conflict resolution: for each anime milmil knows about, if remote
// progress > local, insert watch_progress rows so local catches up. Local
// watch_status_override is never touched here — status-side merging is Phase D.
//
// last_pulled_at is written on every run (even no-op ticks) so the UI can
// display a "checked N minutes ago" freshness hint.
func (s *Service) PullFromProvider(ctx context.Context, userID string, provider ProviderName) (PullResult, error) {
	res := PullResult{Provider: provider}
	prov, ok := s.providers[provider]
	if !ok {
		return res, fmt.Errorf("unknown provider: %s", provider)
	}
	access, _, err := s.tokens.Get(ctx, userID, provider)
	if err != nil {
		return res, err
	}

	entries, err := prov.FetchList(ctx, access)
	if err != nil {
		return res, err
	}
	res.Checked = len(entries)

	for _, e := range entries {
		animeID, ok := s.lookupAnimeByProviderID(ctx, provider, e.ProviderAnimeID)
		if !ok {
			res.Skipped++
			continue
		}

		counts, err := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
			UserID:  userID,
			AnimeID: animeID,
		})
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		localProgress := int(asInt64(counts.CompletedCount))
		if e.Progress <= localProgress {
			continue
		}

		episodes, err := s.q.ListEpisodesByAnimeID(ctx, animeID)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		updated := false
		for i := 0; i < e.Progress && i < len(episodes); i++ {
			if _, err := s.q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
				ID:              uuid.New().String(),
				UserID:          userID,
				EpisodeID:       episodes[i].ID,
				Completed:       1,
				PositionSeconds: 0,
			}); err == nil {
				updated = true
			}
		}
		if updated {
			res.UpdatedLocal++
			// A pull that brings the series to fully-watched counts as having
			// finished it, so a later local rewatch is recognised as one.
			if err := RecordSeriesCompletion(ctx, s.q, userID, animeID); err != nil {
				res.Errors = append(res.Errors, err.Error())
			}
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_ = s.q.UpsertSyncProviderState(ctx, store.UpsertSyncProviderStateParams{
		UserID:       userID,
		Provider:     string(provider),
		PullEnabled:  1,
		LastPulledAt: sql.NullString{String: now, Valid: true},
	})

	if s.wsHub != nil {
		s.wsHub.Broadcast("sync:pulled", map[string]any{
			"provider":      string(provider),
			"updated_count": res.UpdatedLocal,
		})
	}
	return res, nil
}
