package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/bot/commands"
	dcadapter "github.com/milmil/api/internal/bot/discord"
	tgadapter "github.com/milmil/api/internal/bot/telegram"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/danmaku"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/jellyfin"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	_ "github.com/milmil/api/internal/notification/providers" // register provider factories
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
	"github.com/milmil/api/internal/sync/providers"
	"github.com/milmil/api/internal/torrent"
	"github.com/milmil/api/internal/updatecheck"
	"github.com/milmil/api/internal/worker"
	"github.com/milmil/api/internal/ws"
	"github.com/milmil/api/migrations"
)

// wsHubAdapter bridges *ws.Hub to the minimal milmilsync.WSHub interface so
// the sync package doesn't need to import internal/ws (avoids an import
// cycle and keeps the sync seam testable with a spyHub in unit tests).
type wsHubAdapter struct{ hub *ws.Hub }

func (a wsHubAdapter) Broadcast(t string, p map[string]any) {
	if a.hub == nil {
		return
	}
	a.hub.Broadcast(ws.Event{Type: t, Data: p})
}

// initLogger creates a zerolog-backed slog.Logger.
// In debug mode: console output with caller info.
// In production: JSON output at info level.
func initLogger(debug bool) *slog.Logger {
	var zl zerolog.Logger
	if debug {
		zl = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
			Level(zerolog.DebugLevel).
			With().Timestamp().Caller().Logger()
	} else if isTerminal() {
		zl = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
			Level(zerolog.InfoLevel).
			With().Timestamp().Logger()
	} else {
		zl = zerolog.New(os.Stderr).
			Level(zerolog.InfoLevel).
			With().Timestamp().Logger()
	}

	level := slog.LevelInfo
	if debug {
		level = slog.LevelDebug
	}
	return slog.New(slogzerolog.Option{Level: level, Logger: &zl}.NewZerologHandler())
}

func isTerminal() bool {
	fi, err := os.Stderr.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// redactRedisURL masks the password in redis://user:password@host:port format.
//
// Split on the last separator in each case: a password may itself contain '@'
// or ':', and the host part legitimately carries a ':' before the port.
func redactRedisURL(url string) string {
	credentials, host, ok := strings.CutLast(url, "@")
	if !ok {
		return url // no credentials present
	}
	user, _, ok := strings.CutLast(credentials, ":")
	if !ok {
		return credentials + ":***@" + host
	}
	return user + ":***@" + host
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "admin" {
		cmd := newAdminCommand()
		cmd.SetArgs(os.Args[2:])
		if err := cmd.Execute(); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		return
	}

	bootStart := time.Now()

	// Bootstrap logger (info-level) until config is loaded.
	slog.SetDefault(initLogger(false))

	step := time.Now()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	// Re-init with final level based on DEBUG env.
	slog.SetDefault(initLogger(cfg.Debug))
	slog.Debug("boot: config loaded", "took", time.Since(step))

	// Ensure data directory exists
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		slog.Error("mkdir data", "err", err)
		os.Exit(1)
	}

	// Database
	step = time.Now()
	slog.Debug("boot: opening db")
	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("db open", "err", err)
		os.Exit(1)
	}
	defer database.Close()
	slog.Debug("boot: db opened", "took", time.Since(step))

	// Migrations
	step = time.Now()
	slog.Debug("boot: running migrations")
	if err := db.MigrateUp(migrations.FS, cfg.DatabaseURL); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}
	slog.Debug("boot: migrations done", "took", time.Since(step))

	// Cache (Redis or in-memory)
	step = time.Now()
	slog.Debug("boot: initializing cache")
	cacheInit := cache.NewWithStatus(cfg.RedisURL)
	cacheClient := cacheInit.Cache
	if cfg.RedisURL == "" {
		slog.Info("cache initialized", "backend", "memory")
	} else if cacheInit.Backend == cache.BackendRedis {
		slog.Info("cache initialized", "backend", "redis", "url", redactRedisURL(cfg.RedisURL))
	} else {
		slog.Warn("redis unavailable, falling back to memory", "err", cacheInit.Err, "url", redactRedisURL(cfg.RedisURL))
		if cfg.RedisFailFast {
			slog.Error("cache init failed and REDIS_FAIL_FAST is enabled", "err", cacheInit.Err)
			os.Exit(1)
		}
		slog.Info("cache initialized", "backend", "memory", "fallback_from", "redis")
	}
	if cfg.Debug {
		cacheClient = cache.WithDebugLogging(cacheClient, cacheInit.Backend)
		slog.Info("cache debug logging enabled")
	}
	slog.Debug("boot: cache initialized", "took", time.Since(step))

	// Metadata service
	step = time.Now()
	slog.Debug("boot: creating metadata service")
	httpClient := &http.Client{Timeout: 10 * time.Second}
	bangumiClient := bangumi.NewClient(httpClient, "milmil/1.0")
	anilistClient := anilist.NewClient(httpClient)
	metadataSvc := metadata.New(bangumiClient, anilistClient, cacheClient)
	slog.Debug("boot: metadata service ready", "took", time.Since(step))

	// DandanPlay client + matcher
	step = time.Now()
	slog.Debug("boot: creating API clients")
	ddpCredFn := func(ctx context.Context) (string, string, error) {
		setting, err := store.New(database).GetSetting(ctx, "dandanplay")
		if err != nil {
			return "", "", err
		}
		var creds struct {
			AppID     string `json:"app_id"`
			AppSecret string `json:"app_secret"`
		}
		if err := json.Unmarshal([]byte(setting.Value), &creds); err != nil {
			return "", "", fmt.Errorf("parse dandanplay credentials: %w", err)
		}
		return creds.AppID, creds.AppSecret, nil
	}
	ddpClient := dandanplay.NewFallbackClient(
		&http.Client{Timeout: 10 * time.Second},
		ddpCredFn,
		"",              // official URL — uses default
		cfg.DanmuAPIURL, // fallback URL — empty uses default danmu.icu
	)
	// TMDB client (optional — only if API key is configured)
	var tmdbClient tmdb.Client
	tmdbAuth := tmdb.Auth{APIKey: cfg.TMDBAPIKey, AccessToken: cfg.TMDBAccessToken}
	if tmdbSetting, tmdbErr := store.New(database).GetSetting(context.Background(), "tmdb_api_key"); tmdbErr == nil {
		settingAuth := tmdb.AuthFromSetting(tmdbSetting.Value)
		if settingAuth.AccessToken != "" || settingAuth.APIKey != "" {
			tmdbAuth = settingAuth
		}
	}
	if tmdbAuth.AccessToken != "" || tmdbAuth.APIKey != "" {
		tmdbClient = tmdb.NewClientWithAuth(&http.Client{Timeout: 10 * time.Second}, tmdbAuth)
	}
	slog.Debug("boot: API clients ready", "took", time.Since(step))

	// AniDB cross-site mapping service (manami + anime-lists + titles). Loaded
	// from disk on startup if a prior refresh populated the cache; otherwise the
	// scheduler's anidb_refresh job will populate it on first tick.
	anidbDataDir := filepath.Join(cfg.DataDir, "anidb")
	anidbClient := anidb.NewClient(httpClient, "", "", "")
	anidbSvc := anidb.NewService(anidbClient, anidbDataDir)
	if err := anidbSvc.LoadFromDisk(); err != nil {
		slog.Info("anidb: no cached data on startup; will populate on first refresh", "err", err)
	}

	step = time.Now()
	slog.Debug("boot: creating matcher + resolver")
	matcherSvc := matcher.NewMulti(store.New(database), ddpClient, bangumiClient, tmdbClient, cacheClient, anidbSvc)
	providerFactory := func(lib store.Library) (storage.Provider, error) {
		return storage.ProviderForLibrary(lib, cfg.EncryptionKey)
	}
	resolverSvc := resolver.New(store.New(database), bangumiClient, ddpClient, cacheClient, anidbSvc, providerFactory)
	slog.Debug("boot: matcher + resolver ready", "took", time.Since(step))

	// Download engine (built-in torrent + HTTP)
	step = time.Now()
	slog.Debug("boot: creating download engine")
	dlEngine, err := downloader.NewEngine(downloader.Config{
		DataDir:           cfg.DataDir,
		TorrentListenPort: cfg.TorrentListenPort,
		SeedRatio:         cfg.SeedRatio,
		SeedTime:          time.Duration(cfg.SeedTimeMinutes) * time.Minute,
	}, store.New(database))
	if err != nil {
		slog.Error("download engine", "err", err)
		os.Exit(1)
	}
	if err := dlEngine.Start(context.Background()); err != nil {
		slog.Error("download engine start", "err", err)
		os.Exit(1)
	}
	slog.Debug("boot: download engine ready", "took", time.Since(step))

	// WebSocket hub
	wsHub := ws.NewHub()

	// Torrent search providers
	step = time.Now()
	torrentReg := torrent.NewRegistry()
	torrentReg.Register(torrent.NewNyaaProvider())
	torrentReg.Register(torrent.NewDMHYProvider())
	torrentReg.Register(torrent.NewMikanProvider())
	torrentReg.Register(torrent.NewBangumiMoeProvider())
	torrentReg.Register(torrent.NewACGRipProvider())
	torrentReg.Register(torrent.NewDanDanPlayProvider(""))
	slog.Debug("boot: torrent providers registered", "took", time.Since(step))

	// External danmaku sources
	danmakuReg := danmaku.NewRegistry()
	danmakuReg.Register(danmaku.NewBilibiliSource(&http.Client{Timeout: 15 * time.Second}))
	slog.Debug("boot: external danmaku sources registered")

	// Scanner for post-download library scan
	sc := scanner.New(store.New(database))

	// HTTP server
	step = time.Now()
	slog.Debug("boot: initializing router")
	notifier := notification.NewService(store.New(database), wsHub, metadataSvc)

	// Watch-sync service — reads OAuth tokens from the settings table via the
	// SettingsTokenStore. The store is also used by the worker's refresh-on-401
	// path to persist rotated tokens back to settings.
	syncQueries := store.New(database)
	tokenStore := milmilsync.NewSettingsTokenStore(syncQueries)
	alProvider := providers.NewAniList(httpClient, "")
	bgmProvider := providers.NewBangumi(httpClient, "")
	// Load Trakt OAuth app credentials (optional; provider still registers even
	// if creds are missing so the handler can return a clean error).
	var traktClientID, traktClientSecret string
	if setting, err := syncQueries.GetSetting(context.Background(), "trakt_oauth"); err == nil {
		var creds struct {
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
		}
		if err := json.Unmarshal([]byte(setting.Value), &creds); err == nil {
			traktClientID = creds.ClientID
			traktClientSecret = creds.ClientSecret
		}
	}
	traktProvider := providers.NewTrakt(httpClient, "", traktClientID, traktClientSecret)
	syncSvc := milmilsync.NewService(syncQueries, database, []milmilsync.Provider{alProvider, bgmProvider, traktProvider}, tokenStore, wsHubAdapter{hub: wsHub})

	// Update checker — handler dependency + background ticker. The ticker
	// polls GitHub releases hourly (24h cache) and broadcasts a
	// "system:update-available" event over the WS hub when a newer version
	// is observed, so connected clients can show an upgrade banner.
	updateChecker := updatecheck.NewChecker(updatecheck.Config{
		Repo:       "milmil-dev/milmil",
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
		Interval:   1 * time.Hour,
		TTL:        24 * time.Hour,
		Notify: func(r updatecheck.Result) {
			wsHub.Broadcast(ws.Event{
				Type: "system:update-available",
				Data: map[string]any{
					"latest":       r.Latest,
					"release_url":  r.ReleaseURL,
					"published_at": r.PublishedAt.UTC().Format(time.RFC3339),
				},
			})
		},
	})

	e := api.NewRouter(api.Deps{
		Config:        cfg,
		DB:            database,
		Cache:         cacheClient,
		Metadata:      metadataSvc,
		Matcher:       matcherSvc,
		DandanPlay:    ddpClient,
		Resolver:      resolverSvc,
		Downloader:    dlEngine,
		WSHub:         wsHub,
		TMDB:          tmdbClient,
		Torrents:      torrentReg,
		Notifier:      notifier,
		Sync:          syncSvc,
		Danmaku:       danmakuReg,
		UpdateChecker: updateChecker,
	})
	slog.Debug("boot: router initialized", "took", time.Since(step))

	// Start update-checker background ticker. main.go does not currently
	// thread a long-lived signal-bound context through (shutdown is driven
	// by the `quit` chan below), so we use context.Background() here. The
	// goroutine exits naturally on process termination; tightening to a
	// cancellable context can land alongside a broader main.go lifecycle
	// refactor.
	go updateChecker.Run(context.Background())

	// Bot engine
	botRouter := bot.NewRouter()
	botSvc := &commands.Services{
		Queries:    store.New(database),
		Metadata:   metadataSvc,
		Downloader: dlEngine,
		Scanner:    sc,
	}

	// Register commands
	botRouter.RegisterCommand("start", commands.StartHandler(botSvc))
	botRouter.RegisterCommand("schedule", commands.ScheduleHandler(botSvc))
	botRouter.RegisterCommand("search", commands.SearchHandler(botSvc))
	botRouter.RegisterCommand("detail", commands.DetailHandler(botSvc))
	botRouter.RegisterCommand("downloads", commands.DownloadsHandler(botSvc))
	botRouter.RegisterCommand("subscribe", commands.SubscribeHandler(botSvc))
	botRouter.RegisterCommand("status", commands.StatusHandler(botSvc))
	botRouter.RegisterCommand("mylist", commands.MyListHandler(botSvc))
	botRouter.RegisterCommand("continue", commands.ContinueHandler(botSvc))
	botRouter.RegisterCommand("id", commands.IDHandler(botSvc))
	botRouter.RegisterCommand("library", commands.LibraryHandler(botSvc))
	botRouter.RegisterCommand("scan", commands.ScanHandler(botSvc))
	botRouter.RegisterCommand("recent", commands.RecentHandler(botSvc))
	botRouter.RegisterCommand("watching", commands.WatchingHandler(botSvc))
	botRouter.RegisterCommand("stats", commands.StatsHandler(botSvc))
	botRouter.RegisterCommand("rules", commands.RulesHandler(botSvc))
	botRouter.RegisterCommand("trending", commands.TrendingHandler(botSvc))
	botRouter.RegisterCommand("today", commands.TodayHandler(botSvc))

	// Register callbacks (one handler per prefix)
	botRouter.RegisterCallback("detail", commands.DetailCallback(botSvc))
	botRouter.RegisterCallback("sub_pick", commands.SubscribePickCallback(botSvc))
	botRouter.RegisterCallback("sub_do", commands.SubscribeDoCallback(botSvc))
	botRouter.RegisterCallback("dl_pause", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("dl_resume", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("dl_cancel", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("scan", commands.ScanCallback(botSvc))
	botRouter.RegisterCallback("sched", commands.ScheduleCallback(botSvc))
	botRouter.RegisterCallback("menu", commands.MenuCallback(botSvc))
	botRouter.RegisterCallback("rule_disable", commands.RuleDisableCallback(botSvc))
	botRouter.RegisterCallback("cmd", commands.CmdCallback(botSvc, botRouter))

	botEngine := bot.NewEngine(botRouter)
	notifCfg, _ := notification.LoadNotificationConfig(context.Background(), store.New(database))
	botEngine.Start(context.Background(), notifCfg,
		func(cfg notification.TelegramBotConfig, r *bot.Router) (bot.StoppableAdapter, error) {
			return tgadapter.New(cfg, r)
		},
		func(cfg notification.DiscordBotConfig, r *bot.Router) (bot.StoppableAdapter, error) {
			return dcadapter.New(cfg, r)
		},
	)
	slog.Info("boot: bot engine started")

	// Background job scheduler — goroutine-based tickers
	sched := worker.NewScheduler(
		store.New(database), dlEngine, sc, matcherSvc, resolverSvc, tmdbClient, cacheClient, notifier, metadataSvc, anidbSvc, syncSvc, wsHub, botEngine,
	)
	sched.Start()
	slog.Info("boot: scheduler started")

	// Auto-provision admin user from env if configured and no users exist yet
	if cfg.AdminUser != "" && cfg.AdminPassword != "" {
		count, countErr := store.New(database).CountUsers(context.Background())
		if countErr == nil && count == 0 {
			if err := auth.CheckPasswordStrength(cfg.AdminPassword); err != nil {
				slog.Error("boot: ADMIN_PASSWORD rejected", "err", err)
			} else {
				hash, hashErr := auth.HashPassword(cfg.AdminPassword)
				if hashErr == nil {
					_, createErr := store.New(database).CreateUser(context.Background(), store.CreateUserParams{
						ID:           "admin-" + cfg.AdminUser,
						Username:     cfg.AdminUser,
						PasswordHash: hash,
					})
					if createErr == nil {
						slog.Info("boot: auto-provisioned admin user", "username", cfg.AdminUser)
					} else {
						slog.Error("boot: failed to create admin user", "err", createErr)
					}
				}
			}
		}
	}

	slog.Info("boot: ready", "total", time.Since(bootStart))

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	// Echo v5 drives graceful shutdown by cancelling the context passed to
	// StartConfig.Start; srvDone signals when the server has fully stopped.
	srvCtx, srvCancel := context.WithCancel(context.Background())
	defer srvCancel()
	srvDone := make(chan struct{})

	go func() {
		<-quit
		slog.Info("shutting down...")

		// Hard deadline: force exit after 8 seconds no matter what
		go func() {
			time.Sleep(8 * time.Second)
			slog.Warn("shutdown deadline exceeded, forcing exit")
			os.Exit(1)
		}()

		// Stop all components in parallel
		done := make(chan struct{})
		go func() {
			var wg sync.WaitGroup
			wg.Add(4)
			go func() {
				defer wg.Done()
				sched.Stop()
			}()
			go func() {
				defer wg.Done()
				botEngine.Stop()
			}()
			go func() {
				defer wg.Done()
				if err := dlEngine.Stop(); err != nil {
					slog.Error("download engine stop", "err", err)
				}
			}()
			go func() {
				defer wg.Done()
				srvCancel()
				select {
				case <-srvDone:
				case <-time.After(5 * time.Second):
					slog.Error("http shutdown", "err", "timed out waiting for server to stop")
				}
			}()
			wg.Wait()
			close(done)
		}()

		<-done
		slog.Info("shutdown complete")
		os.Exit(0)
	}()

	// Start Jellyfin LAN discovery (UDP 7359)
	addr := fmt.Sprintf(":%d", cfg.APIPort)
	discoveryAddr := fmt.Sprintf("http://%s%s", localIP(), addr)
	stopDiscovery, discErr := jellyfin.StartDiscoveryServer("milmil", "milmil", discoveryAddr)
	if discErr != nil {
		slog.Warn("jellyfin discovery: failed to start", "err", discErr)
	} else {
		defer stopDiscovery()
		slog.Info("Jellyfin LAN discovery enabled", "port", 7359)
	}

	slog.Info("milmil-api starting", "addr", addr, "db", cfg.DatabaseURL)
	startCfg := echo.StartConfig{
		Address:         addr,
		HideBanner:      true,
		GracefulTimeout: 5 * time.Second,
	}
	err = startCfg.Start(srvCtx, e)
	close(srvDone)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server start failed", "err", err)
		os.Exit(1)
	}
}

// localIP returns the first non-loopback IPv4 address found on the machine.
func localIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, a := range addrs {
		if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			return ipnet.IP.String()
		}
	}
	return "127.0.0.1"
}
