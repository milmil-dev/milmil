package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

// Scheduler runs background jobs on simple goroutine tickers,
// replacing River which has SQLite compatibility issues.
type Scheduler struct {
	queries    *store.Queries
	downloader downloader.Manager
	scanner    *scanner.Scanner
	matcher    *matcher.Matcher
	resolver   *resolver.Resolver
	tmdb       tmdb.Client
	cache      cache.Cache
	notifier   *notification.Service
	wsHub      *ws.Hub
	cancel     context.CancelFunc
}

// NewScheduler creates a background scheduler with all dependencies.
func NewScheduler(
	queries *store.Queries,
	dlManager downloader.Manager,
	sc *scanner.Scanner,
	matcherSvc *matcher.Matcher,
	resolverSvc *resolver.Resolver,
	tmdbClient tmdb.Client,
	cacheClient cache.Cache,
	notifier *notification.Service,
	wsHub *ws.Hub,
) *Scheduler {
	return &Scheduler{
		queries:    queries,
		downloader: dlManager,
		scanner:    sc,
		matcher:    matcherSvc,
		resolver:   resolverSvc,
		tmdb:       tmdbClient,
		cache:      cacheClient,
		notifier:   notifier,
		wsHub:      wsHub,
	}
}

// Start launches all periodic background jobs.
func (s *Scheduler) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	slog.Info("scheduler: starting background jobs")

	// RSS refresh — every 5 minutes, run immediately on start
	go s.runTicker(ctx, "rss_refresh", 5*time.Minute, true, func(ctx context.Context) {
		w := &RSSRefreshWorker{queries: s.queries, downloader: s.downloader, notifier: s.notifier}
		w.Run(ctx)
	})

	// Download sync — every 5 seconds, run immediately on start
	go s.runTicker(ctx, "download_sync", 3*time.Second, true, func(ctx context.Context) {
		w := &DownloadSyncWorker{
			queries:    s.queries,
			downloader: s.downloader,
			scanner:    s.scanner,
			matcher:    s.matcher,
			resolver:   s.resolver,
			tmdb:       s.tmdb,
			cache:      s.cache,
			notifier:   s.notifier,
			wsHub:      s.wsHub,
		}
		w.Run(ctx)
	})

	// Notification delivery retry — every 60 seconds
	go s.runTicker(ctx, "notification_delivery", 60*time.Second, false, func(ctx context.Context) {
		w := &NotificationDeliveryWorker{queries: s.queries}
		w.Run(ctx)
	})

	// Notification cleanup — every 24 hours
	go s.runTicker(ctx, "notification_cleanup", 24*time.Hour, false, func(ctx context.Context) {
		if err := s.notifier.CleanupOld(ctx, 30); err != nil {
			slog.Error("notification_cleanup: failed", "err", err)
		}
		cutoff := time.Now().AddDate(0, 0, -30).Format(time.RFC3339)
		if err := s.queries.DeleteOldDeliveries(ctx, cutoff); err != nil {
			slog.Error("notification_cleanup: deliveries failed", "err", err)
		}
	})
}

// Stop cancels all background jobs.
func (s *Scheduler) Stop() {
	if s.cancel != nil {
		slog.Info("scheduler: stopping background jobs")
		s.cancel()
	}
}

func (s *Scheduler) runTicker(ctx context.Context, name string, interval time.Duration, runOnStart bool, fn func(context.Context)) {
	if runOnStart {
		slog.Debug("scheduler: running on start", "job", name)
		fn(ctx)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Debug("scheduler: stopped", "job", name)
			return
		case <-ticker.C:
			fn(ctx)
		}
	}
}
