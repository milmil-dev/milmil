package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// BotReportWorker sends periodic summary reports to configured bot channels.
type BotReportWorker struct {
	generator *bot.ReportGenerator
	queries   *store.Queries
	sendFn    func(resp *bot.BotResponse)
	mu        sync.Mutex
	lastSent  time.Time
}

// NewBotReportWorker creates a new report worker.
func NewBotReportWorker(queries *store.Queries, sendFn func(resp *bot.BotResponse)) *BotReportWorker {
	return &BotReportWorker{
		generator: &bot.ReportGenerator{Queries: queries},
		queries:   queries,
		sendFn:    sendFn,
	}
}

// Run checks if a report is due and sends it.
func (w *BotReportWorker) Run(ctx context.Context) {
	cfg, err := notification.LoadNotificationConfig(ctx, w.queries)
	if err != nil {
		slog.Debug("bot_report: load config failed", "err", err)
		return
	}

	interval := w.resolveInterval(cfg)
	if interval == 0 {
		return
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.lastSent.IsZero() && time.Since(w.lastSent) < interval {
		return
	}

	report, err := w.generator.GenerateDailyReport(ctx)
	if err != nil {
		slog.Error("bot_report: generate failed", "err", err)
		return
	}

	w.sendFn(report)
	w.lastSent = time.Now()
	slog.Info("bot_report: sent periodic report")
}

// resolveInterval reads the report_interval from both Telegram and Discord bot config.
// Returns the first non-empty interval found, or 0 if none configured.
func (w *BotReportWorker) resolveInterval(cfg notification.NotificationConfig) time.Duration {
	if cfg.Bot.Telegram.ReportInterval != "" {
		if d, err := time.ParseDuration(cfg.Bot.Telegram.ReportInterval); err == nil && d > 0 {
			return d
		}
	}
	if cfg.Bot.Discord.ReportInterval != "" {
		if d, err := time.ParseDuration(cfg.Bot.Discord.ReportInterval); err == nil && d > 0 {
			return d
		}
	}
	return 0
}
