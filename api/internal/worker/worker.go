package worker

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/services"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
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
	metadata   *metadata.Service
	anidbSvc   *anidb.Service
	syncSvc    *milmilsync.Service
	wsHub      *ws.Hub
	botEngine  *bot.Engine
	cancel     context.CancelFunc
	registry   *JobRegistry
	// disabledAtStart is the persisted disabled set, applied as jobs register.
	disabledAtStart map[string]bool
	// notifiedAt rate-limits system.service_failed to one per job per hour.
	notifiedMu sync.Mutex
	notifiedAt map[string]time.Time
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
	metadataSvc *metadata.Service,
	anidbSvc *anidb.Service,
	syncSvc *milmilsync.Service,
	wsHub *ws.Hub,
	botEngine *bot.Engine,
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
		metadata:   metadataSvc,
		anidbSvc:   anidbSvc,
		syncSvc:    syncSvc,
		wsHub:      wsHub,
		botEngine:  botEngine,
		notifiedAt: map[string]time.Time{},
	}
}

// SetRegistry shares a job registry with the API so it can list, toggle and
// run jobs. Must be called before Start; Start creates a private one otherwise.
func (s *Scheduler) SetRegistry(r *JobRegistry) {
	s.registry = r
}

// Registry returns the job registry (created on Start when none was set).
func (s *Scheduler) Registry() *JobRegistry {
	return s.registry
}

// serviceFailedNotifyInterval bounds how often one job can raise a
// system.service_failed notification.
const serviceFailedNotifyInterval = time.Hour

// notifyFailure turns a recorded job error into a system.service_failed
// notification, at most once per job per hour.
func (s *Scheduler) notifyFailure(name string, err error) {
	if s.notifier == nil {
		return
	}
	s.notifiedMu.Lock()
	last, seen := s.notifiedAt[name]
	if seen && time.Since(last) < serviceFailedNotifyInterval {
		s.notifiedMu.Unlock()
		return
	}
	s.notifiedAt[name] = time.Now()
	s.notifiedMu.Unlock()
	s.notifier.Send(context.Background(), "system.service_failed", name+" failed", err.Error(), "error",
		map[string]any{"service_id": "worker." + name})
}

// Start launches all periodic background jobs.
func (s *Scheduler) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	if s.registry == nil {
		s.registry = NewJobRegistry()
	}
	if s.registry.OnError == nil {
		s.registry.OnError = s.notifyFailure
	}
	if settings, err := services.Load(ctx, s.queries); err == nil {
		disabled := map[string]bool{}
		for _, id := range settings.Disabled {
			disabled[strings.TrimPrefix(id, "worker.")] = true
		}
		s.disabledAtStart = disabled
	} else {
		slog.Warn("scheduler: load services settings", "err", err)
	}

	slog.Info("scheduler: starting background jobs")

	// RSS refresh — every 5 minutes, run immediately on start
	go s.runTicker(ctx, "rss_refresh", 5*time.Minute, true, func(ctx context.Context) error {
		w := &RSSRefreshWorker{queries: s.queries, downloader: s.downloader, notifier: s.notifier}
		return w.Run(ctx)
	})

	// Download sync — every 5 seconds, run immediately on start
	go s.runTicker(ctx, "download_sync", 3*time.Second, true, func(ctx context.Context) error {
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
		return w.Run(ctx)
	})

	// Library reconciliation — runs on boot and every hour after. Recovers orphan
	// state where a download completed but its post-download pipeline (scan →
	// match → resolve) was interrupted (server restart, crash). The pipeline is
	// idempotent so re-running is cheap and safe.
	go s.runTicker(ctx, "library_reconcile", 1*time.Hour, true, func(ctx context.Context) error {
		libs, err := s.queries.ListLibraries(ctx)
		if err != nil {
			return fmt.Errorf("list libraries: %w", err)
		}
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
		for _, lib := range libs {
			select {
			case <-ctx.Done():
				return nil
			default:
			}
			w.TriggerFullPipeline(lib.ID)
		}
		return nil
	})

	// Notification delivery retry — every 60 seconds
	go s.runTicker(ctx, "notification_delivery", 60*time.Second, false, func(ctx context.Context) error {
		w := &NotificationDeliveryWorker{queries: s.queries}
		return w.Run(ctx)
	})

	// Bot report — check every 60 seconds if a report is due
	if s.botEngine != nil {
		reportWorker := NewBotReportWorker(s.queries, func(resp *bot.BotResponse) {
			cfg, err := notification.LoadNotificationConfig(context.Background(), s.queries)
			if err != nil {
				slog.Error("bot_report: load config for broadcast", "err", err)
				return
			}
			s.botEngine.BroadcastToAll(cfg, resp)
		})
		go s.runTicker(ctx, "bot_report", 60*time.Second, false, func(ctx context.Context) error {
			return reportWorker.Run(ctx)
		})
	}

	// Airing reminder — every 5 minutes, checks if watched anime is about to air
	airingWorker := NewAiringReminderWorker(s.queries, s.metadata, s.notifier)
	go s.runTicker(ctx, "airing_reminder", 5*time.Minute, false, func(ctx context.Context) error {
		return airingWorker.Run(ctx)
	})

	// Daily digest — every 5 minutes, sends once per day at configured time
	digestWorker := NewDailyDigestWorker(s.queries, s.metadata, s.notifier)
	go s.runTicker(ctx, "daily_digest", 5*time.Minute, true, func(ctx context.Context) error {
		return digestWorker.Run(ctx)
	})

	// AniDB cross-site mapping refresh — every 24 hours, run immediately on start
	go s.runTicker(ctx, "anidb_refresh", 24*time.Hour, true, func(ctx context.Context) error {
		w := &AnidbRefreshWorker{svc: s.anidbSvc, wsHub: s.wsHub}
		return w.Run(ctx)
	})

	// Watch-sync outbox drain — every 10s. Bounded batch keeps us within
	// AniList's 90/min rate limit even on worst-case bursts.
	go s.runTicker(ctx, "sync_outbox_drain", 10*time.Second, true, func(ctx context.Context) error {
		return (&SyncDrainWorker{svc: s.syncSvc}).Run(ctx)
	})

	// Watch-sync outbox GC — daily cleanup of completed rows older than 30 days.
	go s.runTicker(ctx, "sync_outbox_gc", 24*time.Hour, true, func(ctx context.Context) error {
		return (&SyncGCWorker{svc: s.syncSvc}).Run(ctx)
	})

	// Watch-sync pull — every 30 minutes, sweep every pull-enabled (user,
	// provider) pair and max-wins-merge remote progress back into milmil.
	go s.runTicker(ctx, "sync_pull", 30*time.Minute, true, func(ctx context.Context) error {
		return (&SyncPullWorker{svc: s.syncSvc, q: s.queries}).Run(ctx)
	})

	// Notification cleanup — every 24 hours
	go s.runTicker(ctx, "notification_cleanup", 24*time.Hour, false, func(ctx context.Context) error {
		if err := s.notifier.CleanupOld(ctx, 30); err != nil {
			return fmt.Errorf("cleanup notifications: %w", err)
		}
		cutoff := time.Now().AddDate(0, 0, -30).Format(time.RFC3339)
		if err := s.queries.DeleteOldDeliveries(ctx, cutoff); err != nil {
			return fmt.Errorf("cleanup deliveries: %w", err)
		}
		return nil
	})
}

// Stop cancels all background jobs.
func (s *Scheduler) Stop() {
	if s.cancel != nil {
		slog.Info("scheduler: stopping background jobs")
		s.cancel()
	}
}

// runTicker registers the job and drives it: on start when asked, then every
// interval. Each tick goes through the registry, which skips disabled jobs,
// refuses to overlap a run already in flight (a manual run from the API),
// and records outcome and timing.
func (s *Scheduler) runTicker(ctx context.Context, name string, interval time.Duration, runOnStart bool, fn JobFunc) {
	s.registry.Register(name, interval, fn)
	if s.disabledAtStart[name] {
		s.registry.SetEnabled(name, false)
	}
	if runOnStart {
		slog.Debug("scheduler: running on start", "job", name)
		s.registry.Tick(ctx, name)
	}
	s.registry.ScheduleNext(name, time.Now().Add(interval))

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Debug("scheduler: stopped", "job", name)
			return
		case <-ticker.C:
			s.registry.Tick(ctx, name)
			s.registry.ScheduleNext(name, time.Now().Add(interval))
		}
	}
}
