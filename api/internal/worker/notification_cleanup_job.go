package worker

import (
	"context"
	"log/slog"

	"github.com/milmil/api/internal/notification"
	"github.com/riverqueue/river"
)

// NotificationCleanupArgs is the job payload for cleaning up old read notifications.
type NotificationCleanupArgs struct{}

func (NotificationCleanupArgs) Kind() string { return "notification_cleanup" }

// NotificationCleanupWorker deletes read notifications older than 30 days.
type NotificationCleanupWorker struct {
	river.WorkerDefaults[NotificationCleanupArgs]
	notifier *notification.Service
}

func (w *NotificationCleanupWorker) Work(ctx context.Context, _ *river.Job[NotificationCleanupArgs]) error {
	if err := w.notifier.CleanupOld(ctx, 30); err != nil {
		slog.Error("notification_cleanup: failed", "err", err)
	}
	return nil
}
