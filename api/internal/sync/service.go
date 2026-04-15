package sync

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"

	"github.com/milmil/api/internal/store"
)

// TokenLoader returns the access token for (user, provider). Return ErrNoToken
// if the user has not connected this provider.
type TokenLoader func(ctx context.Context, userID string, provider ProviderName) (string, error)

// ErrNoToken signals that no OAuth token exists for the given (user, provider).
// TokenLoader implementations should return this (or an error wrapping it) so
// the service can silently skip enqueueing ops for unconnected providers.
var ErrNoToken = errors.New("sync: no token")

// Service wires the outbox queue, registered providers, and token lookup
// together. It is the only entry-point other packages use for watch-sync.
type Service struct {
	q         *store.Queries
	db        *sql.DB
	queue     *Queue
	providers map[ProviderName]Provider
	loadToken TokenLoader
}

// NewService constructs a Service. Providers are indexed by Name() so the
// worker can route outbox rows without a linear scan.
func NewService(q *store.Queries, db *sql.DB, providers []Provider, loadToken TokenLoader) *Service {
	m := make(map[ProviderName]Provider, len(providers))
	for _, p := range providers {
		m[p.Name()] = p
	}
	return &Service{
		q:         q,
		db:        db,
		queue:     NewQueue(q, db),
		providers: m,
		loadToken: loadToken,
	}
}

// OnProgressUpdate derives status for (user, anime) and enqueues one row per
// connected provider. Called synchronously from the PUT /watch-progress
// handler (A1 fix — must be synchronous to guarantee durability; the DB
// write itself is the durability point).
func (s *Service) OnProgressUpdate(ctx context.Context, userID, animeID string) {
	anime, err := s.q.GetAnime(ctx, animeID)
	if err != nil {
		slog.Warn("sync: get anime", "anime", animeID, "err", err)
		return
	}
	if anime.SyncDisabled == 1 {
		return
	}
	status, err := DeriveStatus(ctx, s.q, userID, animeID)
	if err != nil {
		slog.Warn("sync: derive status", "anime", animeID, "err", err)
		return
	}
	counts, _ := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
		UserID: userID, AnimeID: animeID,
	})
	progress := int(asInt64(counts.CompletedCount))

	for name := range s.providers {
		if !hasProviderID(anime, name) {
			continue
		}
		if _, err := s.loadToken(ctx, userID, name); err != nil {
			continue
		}
		op := SyncOp{Kind: KindProgress, AnimeID: animeID, Status: status, Progress: progress}
		if err := s.queue.Enqueue(ctx, userID, name, animeID, op); err != nil {
			slog.Warn("sync: enqueue", "provider", name, "err", err)
		}
	}
}

// EnqueueImport schedules a one-shot import when the user connects OAuth.
// AnimeID is empty — import is a user-level operation that fans out to every
// matched anime in the remote list.
func (s *Service) EnqueueImport(ctx context.Context, userID string, provider ProviderName) error {
	return s.queue.Enqueue(ctx, userID, provider, "", SyncOp{Kind: KindImport})
}

// FlushUser enqueues a full library push for manual "Sync Now".
// A5 fix — ListAnimeForUserWithProviderID already filters wp.completed=1 so
// only animes with actual watched episodes are enqueued.
func (s *Service) FlushUser(ctx context.Context, userID string, provider ProviderName) (int, error) {
	animes, err := s.q.ListAnimeForUserWithProviderID(ctx, store.ListAnimeForUserWithProviderIDParams{
		UserID:   userID,
		Provider: string(provider),
	})
	if err != nil {
		return 0, err
	}
	enqueued := 0
	for _, a := range animes {
		if a.SyncDisabled == 1 {
			continue
		}
		status, err := DeriveStatus(ctx, s.q, userID, a.ID)
		if err != nil {
			continue
		}
		counts, _ := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
			UserID: userID, AnimeID: a.ID,
		})
		op := SyncOp{
			Kind:     KindProgress,
			AnimeID:  a.ID,
			Status:   status,
			Progress: int(asInt64(counts.CompletedCount)),
		}
		if err := s.queue.Enqueue(ctx, userID, provider, a.ID, op); err != nil {
			continue
		}
		enqueued++
	}
	return enqueued, nil
}

// Disconnect marks every outstanding op for (user, provider) as fatally
// completed with a "disconnected" marker, so the worker never touches them
// again after the user revokes OAuth.
func (s *Service) Disconnect(ctx context.Context, userID string, provider ProviderName) error {
	return s.q.MarkUserProviderOpsFailed(ctx, store.MarkUserProviderOpsFailedParams{
		UserID:    userID,
		Provider:  string(provider),
		LastError: sql.NullString{String: "disconnected", Valid: true},
	})
}

// GCCompletedBefore removes completed outbox rows older than cutoffISO. Meant
// for a periodic janitor tick.
func (s *Service) GCCompletedBefore(ctx context.Context, cutoffISO string) error {
	return s.q.DeleteCompletedSyncOpsOlderThan(ctx, sql.NullString{String: cutoffISO, Valid: true})
}

// hasProviderID reports whether the anime row has a non-zero provider-native
// id for the given provider. Used to skip enqueueing for unmapped animes.
func hasProviderID(a store.Anime, p ProviderName) bool {
	switch p {
	case ProviderAniList:
		return a.AnilistID.Valid && a.AnilistID.Int64 != 0
	case ProviderBangumi:
		return a.BangumiID.Valid && a.BangumiID.Int64 != 0
	}
	return false
}
