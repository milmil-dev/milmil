package worker

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/milmil/api/internal/integration/aria2"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riversqlite"
)

// Workers holds the River workers registry.
var Workers = river.NewWorkers()

// RegisterWorkers adds all background job workers.
func RegisterWorkers(queries *store.Queries, aria2Client aria2.Client, sc *scanner.Scanner, notifier *notification.Service) {
	river.AddWorker(Workers, &RSSRefreshWorker{queries: queries, aria2: aria2Client, notifier: notifier})
	river.AddWorker(Workers, &DownloadSyncWorker{queries: queries, aria2: aria2Client, scanner: sc, notifier: notifier})
	river.AddWorker(Workers, &NotificationCleanupWorker{notifier: notifier})
}

// NewClient creates a River client with periodic RSS refresh scheduling.
func NewClient(_ context.Context, db *sql.DB, databaseURL string) (*river.Client[*sql.Tx], error) {
	if strings.HasPrefix(databaseURL, "postgres") {
		return nil, fmt.Errorf("postgres River client not yet implemented — use SQLite for Phase 1")
	}

	client, err := river.NewClient(riversqlite.New(db), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 2},
		},
		Workers: Workers,
		PeriodicJobs: []*river.PeriodicJob{
			river.NewPeriodicJob(
				river.PeriodicInterval(5*time.Minute),
				func() (river.JobArgs, *river.InsertOpts) {
					return RSSRefreshArgs{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: true},
			),
			river.NewPeriodicJob(
				river.PeriodicInterval(30*time.Second),
				func() (river.JobArgs, *river.InsertOpts) {
					return DownloadSyncArgs{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: true},
			),
			river.NewPeriodicJob(
				river.PeriodicInterval(24*time.Hour),
				func() (river.JobArgs, *river.InsertOpts) {
					return NotificationCleanupArgs{}, nil
				},
				nil,
			),
		},
		Logger: slog.Default(),
	})
	if err != nil {
		return nil, fmt.Errorf("river sqlite client: %w", err)
	}
	return client, nil
}
