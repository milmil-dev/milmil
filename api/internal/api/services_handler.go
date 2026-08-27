package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/labstack/echo/v5"

	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/services"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/version"
	"github.com/milmil/api/internal/worker"
	"github.com/milmil/api/internal/ws"
)

// Settings › 服務: one list of everything the backend runs in the background
// — the Jellyfin layer, the scheduler's jobs, the chat bots and the daemons —
// with enough state to see what is healthy, switch things off, and run a job
// on demand.

type serviceDTO struct {
	ID              string         `json:"id"`
	Kind            string         `json:"kind"`
	Name            string         `json:"name"`
	Enabled         bool           `json:"enabled"`
	Controllable    bool           `json:"controllable"`
	Runnable        bool           `json:"runnable"`
	Running         bool           `json:"running"`
	IntervalSeconds *int64         `json:"interval_seconds"`
	LastRunAt       *string        `json:"last_run_at"`
	LastDurationMs  *int64         `json:"last_duration_ms"`
	LastError       string         `json:"last_error"`
	NextRunAt       *string        `json:"next_run_at"`
	Summary         string         `json:"summary"`
	Extra           map[string]any `json:"extra"`
}

type servicesSystemBlock struct {
	Version       string `json:"version"`
	UptimeSeconds int64  `json:"uptime_seconds"`
	StartedAt     string `json:"started_at"`
}

type servicesResponse struct {
	Services []serviceDTO        `json:"services"`
	System   servicesSystemBlock `json:"system"`
}

// workerNames gives each ticker an English label; the clients localize.
var workerNames = map[string]string{
	"rss_refresh":           "RSS refresh",
	"download_sync":         "Download sync",
	"library_reconcile":     "Library reconcile",
	"notification_delivery": "Notification delivery",
	"bot_report":            "Bot report",
	"airing_reminder":       "Airing reminder",
	"daily_digest":          "Daily digest",
	"anidb_refresh":         "AniDB mapping refresh",
	"sync_outbox_drain":     "Watch-sync outbox",
	"sync_outbox_gc":        "Watch-sync cleanup",
	"sync_pull":             "Watch-sync pull",
	"notification_cleanup":  "Notification cleanup",
}

// coreWorkers keep the server coherent and cannot be switched off.
var coreWorkers = map[string]bool{"download_sync": true, "notification_delivery": true}

const (
	serviceJellyfin      = "jellyfin"
	serviceDownloader    = "downloader"
	serviceTranscode     = "transcode_cache"
	serviceSync          = "sync"
	serviceBackup        = "backup"
	serviceBotTelegram   = "bot.telegram"
	serviceBotDiscord    = "bot.discord"
	workerPrefix         = "worker."
	serviceChangedEvent  = "service:changed"
	servicesUnknownError = "unknown service"
)

// backupRunning guards the on-demand preference backup like the registry
// guards jobs: one at a time.
var backupRunning atomic.Bool

func (h *handler) handleListServices(c *echo.Context) error {
	ctx := c.Request().Context()
	out := servicesResponse{
		Services: h.buildServices(ctx, c, getUserID(c)),
		System: servicesSystemBlock{
			Version:       version.Version,
			UptimeSeconds: int64(time.Since(startTime).Seconds()),
			StartedAt:     startTime.UTC().Format(time.RFC3339),
		},
	}
	return c.JSON(http.StatusOK, out)
}

type updateServiceRequest struct {
	Enabled          *bool `json:"enabled"`
	DiscoveryEnabled *bool `json:"discovery_enabled"`
}

func (h *handler) handleUpdateService(c *echo.Context) error {
	ctx := c.Request().Context()
	id := c.Param("id")
	var req updateServiceRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}
	settings, err := services.Load(ctx, h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	switch {
	case id == serviceJellyfin:
		if h.jellyfin == nil {
			return echo.ErrNotFound
		}
		if req.Enabled == nil && req.DiscoveryEnabled == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "enabled or discovery_enabled required")
		}
		if req.Enabled != nil {
			settings.Jellyfin.Enabled = req.Enabled
			h.jellyfin.SetEnabled(*req.Enabled)
		}
		if req.DiscoveryEnabled != nil {
			settings.Jellyfin.DiscoveryEnabled = req.DiscoveryEnabled
		}
		if err := services.Save(ctx, h.queries, settings); err != nil {
			return echo.ErrInternalServerError
		}
		if settings.DiscoveryEnabled() && settings.JellyfinEnabled() {
			if err := h.jellyfin.StartDiscovery(); err != nil {
				return echo.NewHTTPError(http.StatusConflict, "discovery: "+err.Error())
			}
		} else {
			h.jellyfin.StopDiscovery()
		}
	case strings.HasPrefix(id, workerPrefix):
		name := strings.TrimPrefix(id, workerPrefix)
		if h.jobs == nil {
			return echo.ErrNotFound
		}
		if _, ok := h.jobs.Get(name); !ok {
			return echo.ErrNotFound
		}
		if coreWorkers[name] {
			return echo.NewHTTPError(http.StatusBadRequest, "this job cannot be switched off")
		}
		if req.Enabled == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "enabled required")
		}
		settings.SetDisabled(id, !*req.Enabled)
		if err := services.Save(ctx, h.queries, settings); err != nil {
			return echo.ErrInternalServerError
		}
		h.jobs.SetEnabled(name, *req.Enabled)
	case id == serviceBotTelegram || id == serviceBotDiscord:
		if req.Enabled == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "enabled required")
		}
		cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
		if err != nil {
			return echo.ErrInternalServerError
		}
		if id == serviceBotTelegram {
			cfg.Bot.Telegram.Enabled = *req.Enabled
		} else {
			cfg.Bot.Discord.Enabled = *req.Enabled
		}
		data, err := json.Marshal(cfg)
		if err != nil {
			return echo.ErrInternalServerError
		}
		if _, err := h.queries.UpsertSetting(ctx, store.UpsertSettingParams{Key: "notifications", Value: string(data)}); err != nil {
			return echo.ErrInternalServerError
		}
		if h.reloadBots != nil {
			h.reloadBots(context.Background(), cfg)
		}
	default:
		if h.findService(ctx, c, getUserID(c), id) == nil {
			return echo.ErrNotFound
		}
		return echo.NewHTTPError(http.StatusBadRequest, "this service cannot be switched off")
	}

	dto := h.findService(ctx, c, getUserID(c), id)
	if dto == nil {
		return echo.ErrNotFound
	}
	h.broadcastService(*dto)
	return c.JSON(http.StatusOK, dto)
}

func (h *handler) handleRunService(c *echo.Context) error {
	ctx := c.Request().Context()
	id := c.Param("id")
	userID := getUserID(c)

	runJob := func(name string) error {
		if h.jobs == nil {
			return echo.ErrNotFound
		}
		state, ok := h.jobs.Get(name)
		if !ok {
			return echo.ErrNotFound
		}
		if state.Running {
			return echo.NewHTTPError(http.StatusConflict, "already running")
		}
		go func() {
			if err := h.jobs.Run(context.Background(), name); err != nil && !errors.Is(err, worker.ErrJobRunning) {
				h.broadcastService(h.workerDTO(name))
			}
		}()
		return c.JSON(http.StatusAccepted, map[string]bool{"started": true})
	}

	switch {
	case strings.HasPrefix(id, workerPrefix):
		return runJob(strings.TrimPrefix(id, workerPrefix))
	case id == serviceSync:
		return runJob("sync_pull")
	case id == serviceBackup:
		if !backupRunning.CompareAndSwap(false, true) {
			return echo.NewHTTPError(http.StatusConflict, "already running")
		}
		go func() {
			defer backupRunning.Store(false)
			if _, err := h.runPreferenceSync(context.Background(), userID); err != nil {
				h.recordBackupError(err)
			}
			h.broadcastService(h.backupDTO(context.Background(), userID))
		}()
		return c.JSON(http.StatusAccepted, map[string]bool{"started": true})
	default:
		if h.findService(ctx, c, userID, id) == nil {
			return echo.ErrNotFound
		}
		return echo.NewHTTPError(http.StatusBadRequest, "this service cannot be run on demand")
	}
}

func (h *handler) handleListJellyfinDevices(c *echo.Context) error {
	if h.jellyfin == nil {
		return echo.ErrNotFound
	}
	devices, err := h.jellyfin.ListDevices(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{"devices": devices})
}

func (h *handler) handleRevokeJellyfinDevice(c *echo.Context) error {
	if h.jellyfin == nil {
		return echo.ErrNotFound
	}
	revoked, err := h.jellyfin.RevokeDevice(c.Request().Context(), c.Param("deviceId"))
	if err != nil {
		return echo.ErrInternalServerError
	}
	if !revoked {
		return echo.ErrNotFound
	}
	if dto := h.jellyfinDTO(c.Request().Context(), c); dto != nil {
		h.broadcastService(*dto)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Building the list ──────────────────────────────────────────────────────

func (h *handler) buildServices(ctx context.Context, c *echo.Context, userID string) []serviceDTO {
	out := make([]serviceDTO, 0, 20)
	if dto := h.jellyfinDTO(ctx, c); dto != nil {
		out = append(out, *dto)
	}
	if h.jobs != nil {
		for _, state := range h.jobs.Snapshot() {
			out = append(out, workerStateDTO(state))
		}
	}
	out = append(out, h.downloaderDTO(ctx), transcodeCacheDTO(), h.syncDTO(ctx), h.backupDTO(ctx, userID))
	out = append(out, h.botDTOs(ctx)...)
	return out
}

func (h *handler) findService(ctx context.Context, c *echo.Context, userID, id string) *serviceDTO {
	for _, dto := range h.buildServices(ctx, c, userID) {
		if dto.ID == id {
			return &dto
		}
	}
	return nil
}

func (h *handler) jellyfinDTO(ctx context.Context, c *echo.Context) *serviceDTO {
	if h.jellyfin == nil {
		return nil
	}
	enabled := h.jellyfin.Enabled()
	discovery := h.jellyfin.DiscoveryEnabled()
	count := h.jellyfin.DeviceCount(ctx)
	summary := "Off"
	if enabled {
		summary = fmt.Sprintf("%d device(s)", count)
		if discovery {
			summary += " · LAN discovery on"
		}
	}
	return &serviceDTO{
		ID: serviceJellyfin, Kind: "api", Name: "Jellyfin-compatible API",
		Enabled: enabled, Controllable: true, Runnable: false, Running: enabled,
		Summary: summary,
		Extra: map[string]any{
			"address":           requestBaseURL(c) + "/jellyfin",
			"discovery_enabled": discovery,
			"discovery_port":    7359,
			"device_count":      count,
		},
	}
}

func (h *handler) workerDTO(name string) serviceDTO {
	if h.jobs != nil {
		if state, ok := h.jobs.Get(name); ok {
			return workerStateDTO(state)
		}
	}
	return serviceDTO{ID: workerPrefix + name, Kind: "worker", Name: workerNames[name]}
}

func workerStateDTO(state worker.JobState) serviceDTO {
	name := workerNames[state.Name]
	if name == "" {
		name = state.Name
	}
	interval := int64(state.Interval / time.Second)
	dto := serviceDTO{
		ID: workerPrefix + state.Name, Kind: "worker", Name: name,
		Enabled: state.Enabled, Controllable: !coreWorkers[state.Name], Runnable: true, Running: state.Running,
		IntervalSeconds: &interval, LastError: state.LastError,
		Summary: "Every " + humanInterval(state.Interval),
	}
	if state.LastRunAt != nil {
		v := state.LastRunAt.UTC().Format(time.RFC3339)
		dto.LastRunAt = &v
	}
	if state.LastDurationMs != nil {
		v := *state.LastDurationMs
		dto.LastDurationMs = &v
	}
	if state.NextRunAt != nil {
		v := state.NextRunAt.UTC().Format(time.RFC3339)
		dto.NextRunAt = &v
	}
	return dto
}

func (h *handler) downloaderDTO(ctx context.Context) serviceDTO {
	healthy := h.downloader != nil && h.downloader.Healthy()
	active := 0
	if rows, err := h.queries.ListActiveDownloads(ctx); err == nil {
		active = len(rows)
	}
	summary := "Unavailable"
	if healthy {
		summary = fmt.Sprintf("Healthy · %d active", active)
	}
	return serviceDTO{
		ID: serviceDownloader, Kind: "daemon", Name: "Downloader",
		Enabled: true, Running: healthy, Summary: summary,
		Extra: map[string]any{"engine": "builtin", "healthy": healthy, "active": active},
	}
}

func transcodeCacheDTO() serviceDTO {
	dir := filepath.Join(os.TempDir(), "milmil", "transcode")
	var bytes int64
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			bytes += info.Size()
		}
		return nil
	})
	return serviceDTO{
		ID: serviceTranscode, Kind: "daemon", Name: "Transcode cache",
		Enabled: true, Running: true, Summary: humanBytes(bytes),
		Extra: map[string]any{"bytes": bytes},
	}
}

// syncDTO is the watch-progress sync (AniList / Bangumi / Trakt outbox).
func (h *handler) syncDTO(ctx context.Context) serviceDTO {
	providers := 0
	if rows, err := h.queries.ListPullEnabledProviders(ctx); err == nil {
		providers = len(rows)
	}
	dto := serviceDTO{
		ID: serviceSync, Kind: "daemon", Name: "Watch sync",
		Enabled: providers > 0, Runnable: h.jobs != nil, Running: false,
		Summary: fmt.Sprintf("%d provider(s) linked", providers),
		Extra:   map[string]any{"providers": providers},
	}
	if h.jobs != nil {
		if state, ok := h.jobs.Get("sync_pull"); ok {
			dto.Running = state.Running
			dto.LastError = state.LastError
			if state.LastRunAt != nil {
				v := state.LastRunAt.UTC().Format(time.RFC3339)
				dto.LastRunAt = &v
			}
		}
	}
	return dto
}

var lastBackupError atomic.Value // string

func (h *handler) recordBackupError(err error) {
	lastBackupError.Store(err.Error())
}

// backupDTO is the preference backup to WebDAV / S3 for the current user.
func (h *handler) backupDTO(ctx context.Context, userID string) serviceDTO {
	rows, _ := h.queries.ListBackupConfigs(ctx, userID)
	targets := make([]string, 0, len(rows))
	var last *string
	for _, row := range rows {
		if row.Enabled == 0 {
			continue
		}
		targets = append(targets, row.Type)
		if row.LastSyncAt.Valid && (last == nil || row.LastSyncAt.String > *last) {
			v := row.LastSyncAt.String
			last = &v
		}
	}
	summary := "Not configured"
	if len(targets) > 0 {
		summary = strings.Join(targets, ", ")
	}
	lastErr, _ := lastBackupError.Load().(string)
	return serviceDTO{
		ID: serviceBackup, Kind: "daemon", Name: "Preference backup",
		Enabled: len(targets) > 0, Runnable: len(targets) > 0, Running: backupRunning.Load(),
		LastRunAt: last, LastError: lastErr, Summary: summary,
		Extra: map[string]any{"targets": targets},
	}
}

func (h *handler) botDTOs(ctx context.Context) []serviceDTO {
	cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return nil
	}
	tg := cfg.Bot.Telegram
	dc := cfg.Bot.Discord
	tgSummary := "Not configured"
	if tg.BotToken != "" {
		tgSummary = fmt.Sprintf("%d chat(s)", len(tg.AllowedChatIDs))
		if tg.ReportInterval != "" {
			tgSummary += " · report every " + tg.ReportInterval
		}
	}
	dcSummary := "Not configured"
	if dc.BotToken != "" {
		dcSummary = fmt.Sprintf("%d guild(s)", len(dc.AllowedGuildIDs))
		if dc.ReportInterval != "" {
			dcSummary += " · report every " + dc.ReportInterval
		}
	}
	return []serviceDTO{
		{
			ID: serviceBotTelegram, Kind: "bot", Name: "Telegram bot",
			Enabled: tg.Enabled, Controllable: true, Running: tg.Enabled && tg.BotToken != "",
			Summary: tgSummary, Extra: map[string]any{"configured": tg.BotToken != ""},
		},
		{
			ID: serviceBotDiscord, Kind: "bot", Name: "Discord bot",
			Enabled: dc.Enabled, Controllable: true, Running: dc.Enabled && dc.BotToken != "",
			Summary: dcSummary, Extra: map[string]any{"configured": dc.BotToken != ""},
		},
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func (h *handler) broadcastService(dto serviceDTO) {
	if h.wsHub != nil {
		h.wsHub.Broadcast(ws.Event{Type: serviceChangedEvent, Data: dto})
	}
}

// requestBaseURL is the origin the client reached us on, so the Jellyfin
// address it is shown works from where it stands (reverse proxies included).
func requestBaseURL(c *echo.Context) string {
	r := c.Request()
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return scheme + "://" + host
}

func humanInterval(d time.Duration) string {
	switch {
	case d >= time.Hour && d%time.Hour == 0:
		return fmt.Sprintf("%d h", int(d/time.Hour))
	case d >= time.Minute && d%time.Minute == 0:
		return fmt.Sprintf("%d min", int(d/time.Minute))
	default:
		return fmt.Sprintf("%d s", int(d/time.Second))
	}
}

func humanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGTPE"[exp])
}
