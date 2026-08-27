package worker

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/ws"
)

// AnidbRefreshWorker periodically refreshes the AniDB cross-site mapping and
// title index. A nil service is a no-op (feature disabled).
type AnidbRefreshWorker struct {
	svc   *anidb.Service
	wsHub *ws.Hub
}

func (w *AnidbRefreshWorker) Run(ctx context.Context) error {
	if w.svc == nil {
		return nil
	}
	if err := w.svc.Refresh(ctx); err != nil {
		return fmt.Errorf("refresh: %w", err)
	}
	if w.wsHub != nil {
		w.wsHub.Broadcast(ws.Event{Type: "anidb:refreshed"})
	}
	return nil
}
