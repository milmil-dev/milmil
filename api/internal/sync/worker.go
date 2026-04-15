package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	stdsync "sync"
	"time"

	"github.com/milmil/api/internal/store"
)

// drainMu serializes Drain ticks across goroutines. Overlapping timer
// invocations (A6) skip the tick rather than double-processing.
var drainMu stdsync.Mutex

// deadLetterAttempts is the number of retries after which a transient error
// is demoted to fatal (we mark the row completed with the last error stored).
const deadLetterAttempts = 30

// Drain processes up to batchSize ready rows. Overlapping ticks are skipped
// via drainMu (A6). Rows are grouped by (user_id, provider) so a 429 in the
// first row defers the rest of the group to the same retry window (A3) —
// this prevents blasting N more requests at an already-rate-limited API.
func (s *Service) Drain(ctx context.Context, batchSize int64) {
	if !drainMu.TryLock() {
		slog.Info("sync: drain already running, skipping tick")
		return
	}
	defer drainMu.Unlock()

	if batchSize <= 0 {
		batchSize = 10
	}
	rows, err := s.q.ListReadySyncOps(ctx, batchSize)
	if err != nil {
		slog.Warn("sync: list ready", "err", err)
		return
	}

	groups := make(map[string][]store.SyncOutbox)
	order := []string{}
	for _, r := range rows {
		key := r.UserID + "|" + r.Provider
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], r)
	}

	for _, key := range order {
		s.processGroup(ctx, groups[key])
	}
}

// processGroup walks a single (user, provider) slice. If any row signals a
// rate-limit via TransientError.RetryAfter, every following row in the group
// is deferred to the same window without being processed.
func (s *Service) processGroup(ctx context.Context, group []store.SyncOutbox) {
	var pausedUntil time.Time
	for _, row := range group {
		if !pausedUntil.IsZero() {
			_ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
				Attempts:      row.Attempts,
				NextAttemptAt: pausedUntil.UTC().Format("2006-01-02T15:04:05Z"),
				LastError:     sql.NullString{String: "rate-limited group", Valid: true},
				ID:            row.ID,
			})
			continue
		}
		retryAfter := s.processRow(ctx, row)
		if retryAfter > 0 {
			pausedUntil = time.Now().UTC().Add(retryAfter)
		}
	}
}

// processRow returns a non-zero RetryAfter when the provider signaled a
// rate-limit. The returned duration is the window the whole group should be
// held for; zero means the caller can continue immediately with the next row.
func (s *Service) processRow(ctx context.Context, row store.SyncOutbox) time.Duration {
	prov, ok := s.providers[ProviderName(row.Provider)]
	if !ok {
		s.failRow(ctx, row, "unknown provider", true)
		return 0
	}
	tok, err := s.loadToken(ctx, row.UserID, ProviderName(row.Provider))
	if err != nil {
		s.failRow(ctx, row, "no token: "+err.Error(), true)
		return 0
	}

	var op SyncOp
	if err := json.Unmarshal([]byte(row.Payload), &op); err != nil {
		s.failRow(ctx, row, "bad payload: "+err.Error(), true)
		return 0
	}

	if op.Kind == KindImport {
		if err := s.runImport(ctx, row.UserID, prov, tok); err != nil {
			if te, ok := IsTransient(err); ok {
				s.retryRow(ctx, row, te)
				return te.RetryAfter
			}
			s.failRow(ctx, row, err.Error(), false)
			return 0
		}
		s.completeRow(ctx, row)
		return 0
	}

	anime, err := s.q.GetAnime(ctx, row.AnimeID)
	if err != nil {
		s.failRow(ctx, row, "no anime: "+err.Error(), true)
		return 0
	}
	rawEpIDs, _ := s.q.ListBangumiEpisodeIDsForAnimeWatchedByUser(ctx,
		store.ListBangumiEpisodeIDsForAnimeWatchedByUserParams{
			AnimeID: row.AnimeID,
			UserID:  row.UserID,
		})
	epIDs := make([]int64, 0, len(rawEpIDs))
	for _, n := range rawEpIDs {
		if n.Valid {
			epIDs = append(epIDs, n.Int64)
		}
	}
	ids := ExternalIDs{
		AniList:           nullInt(anime.AnilistID),
		Bangumi:           nullInt(anime.BangumiID),
		MAL:               nullInt(anime.MalID),
		TMDB:              nullInt(anime.TmdbID),
		AniDB:             nullInt(anime.AnidbID),
		BangumiEpisodeIDs: epIDs,
	}

	if err := prov.Push(ctx, tok, op, ids); err != nil {
		if te, ok := IsTransient(err); ok {
			s.retryRow(ctx, row, te)
			return te.RetryAfter
		}
		s.failRow(ctx, row, err.Error(), false)
		return 0
	}
	s.completeRow(ctx, row)
	return 0
}

// retryRow reschedules a transient failure using exponential backoff, or
// demotes to dead-letter once deadLetterAttempts is reached.
func (s *Service) retryRow(ctx context.Context, row store.SyncOutbox, te *TransientError) {
	attempts := row.Attempts + 1
	delay := Backoff(int(attempts))
	if te.RetryAfter > delay {
		delay = te.RetryAfter
	}
	if attempts >= deadLetterAttempts {
		s.failRow(ctx, row, "dead-letter: "+te.Err.Error(), true)
		return
	}
	_ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
		Attempts:      attempts,
		NextAttemptAt: time.Now().UTC().Add(delay).Format("2006-01-02T15:04:05Z"),
		LastError:     sql.NullString{String: te.Err.Error(), Valid: true},
		ID:            row.ID,
	})
}

// completeRow marks a row as successfully processed.
func (s *Service) completeRow(ctx context.Context, row store.SyncOutbox) {
	_ = s.q.MarkSyncOpCompleted(ctx, row.ID)
}

// failRow handles fatal failures. When immediatelyFatal is true, the row is
// marked completed (no more retries). Otherwise it's pushed out 24h with the
// reason recorded — a soft-fail so a future operator can triage.
func (s *Service) failRow(ctx context.Context, row store.SyncOutbox, reason string, immediatelyFatal bool) {
	slog.Warn("sync: row failed",
		"provider", row.Provider,
		"anime", row.AnimeID,
		"err", reason,
		"fatal", immediatelyFatal,
	)
	if immediatelyFatal {
		_ = s.q.MarkSyncOpCompleted(ctx, row.ID)
		return
	}
	_ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
		Attempts:      row.Attempts + 1,
		NextAttemptAt: time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02T15:04:05Z"),
		LastError:     sql.NullString{String: reason, Valid: true},
		ID:            row.ID,
	})
}

// nullInt unwraps a sql.NullInt64 to a plain int64 (0 when NULL).
func nullInt(n sql.NullInt64) int64 {
	if n.Valid {
		return n.Int64
	}
	return 0
}
