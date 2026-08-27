package worker

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
)

// SyncPullWorker runs a periodic pull for every (user, provider) pair that
// has pull_enabled=1. Zero enabled rows → silent no-op; the scheduler keeps
// ticking cheaply. Per-provider errors are logged but do not stop the sweep.
type SyncPullWorker struct {
	svc *milmilsync.Service
	q   *store.Queries
}

func (w *SyncPullWorker) Run(ctx context.Context) error {
	if w.svc == nil || w.q == nil {
		return nil
	}
	rows, err := w.q.ListPullEnabledProviders(ctx)
	if err != nil {
		return fmt.Errorf("list pull-enabled providers: %w", err)
	}
	for _, r := range rows {
		if _, err := w.svc.PullFromProvider(ctx, r.UserID, milmilsync.ProviderName(r.Provider)); err != nil {
			slog.Warn("pull: provider failed", "user", r.UserID, "provider", r.Provider, "err", err)
		}
	}
	return nil
}
