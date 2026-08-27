package worker

import (
	"context"
	"fmt"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

// SyncDrainWorker ticks the outbox drain loop. Bounded batch (10) keeps us
// within AniList's 90/min rate limit even if every row goes upstream.
type SyncDrainWorker struct{ svc *milmilsync.Service }

func (w *SyncDrainWorker) Run(ctx context.Context) error {
	if w.svc == nil {
		return nil
	}
	w.svc.Drain(ctx, 10) // A6 fix: batch=10 fits AniList 90/min rate limit in 10s tick
	return nil
}

// SyncGCWorker deletes completed outbox rows older than 30 days.
type SyncGCWorker struct{ svc *milmilsync.Service }

func (w *SyncGCWorker) Run(ctx context.Context) error {
	if w.svc == nil {
		return nil
	}
	cutoff := time.Now().UTC().Add(-30 * 24 * time.Hour).Format("2006-01-02T15:04:05Z")
	if err := w.svc.GCCompletedBefore(ctx, cutoff); err != nil {
		return fmt.Errorf("gc: %w", err)
	}
	return nil
}
