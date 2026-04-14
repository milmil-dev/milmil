package worker

import (
	"context"
	"log/slog"

	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/ws"
)

// AnidbRefreshWorker periodically refreshes the AniDB cross-site mapping and
// title index. A nil service is a no-op (feature disabled).
type AnidbRefreshWorker struct {
	svc   *anidb.Service
	wsHub *ws.Hub
}

func (w *AnidbRefreshWorker) Run(ctx context.Context) {
	if w.svc == nil {
		return
	}
	if err := w.svc.Refresh(ctx); err != nil {
		slog.Warn("anidb: refresh failed", "err", err)
		return
	}
	if w.wsHub != nil {
		w.wsHub.Broadcast(ws.Event{Type: "anidb:refreshed"})
	}
}
