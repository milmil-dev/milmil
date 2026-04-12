package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/bot/commands"
	dcadapter "github.com/milmil/api/internal/bot/discord"
	tgadapter "github.com/milmil/api/internal/bot/telegram"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	_ "github.com/milmil/api/internal/notification/providers" // register provider factories
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/torrent"
	"github.com/milmil/api/internal/worker"
	"github.com/milmil/api/internal/ws"
	"github.com/milmil/api/migrations"
)

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

// redactRedisURL masks the password in redis://user:password@host:port format
func redactRedisURL(url string) string {
	if !strings.Contains(url, "@") {
		return url // No password present
	}
	// Format: redis://user:password@host:port → redis://user:***@host:port
	at := strings.LastIndex(url, "@")
	before := url[:at]
	after := url[at:]

	colon := strings.LastIndex(before, ":")
	if colon == -1 {
		return before + ":***" + after
	}
	return before[:colon] + ":***" + after
}

func main() {
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
		json.Unmarshal([]byte(setting.Value), &creds)
		return creds.AppID, creds.AppSecret, nil
	}
	ddpClient := dandanplay.NewClient(&http.Client{Timeout: 10 * time.Second}, ddpCredFn)
	// TMDB client (optional — only if API key is configured)
	var tmdbClient tmdb.Client
	if tmdbSetting, tmdbErr := store.New(database).GetSetting(context.Background(), "tmdb_api_key"); tmdbErr == nil && tmdbSetting.Value != "" {
		tmdbClient = tmdb.NewClient(&http.Client{Timeout: 10 * time.Second}, tmdbSetting.Value)
	}
	slog.Debug("boot: API clients ready", "took", time.Since(step))

	step = time.Now()
	slog.Debug("boot: creating matcher + resolver")
	matcherSvc := matcher.NewMulti(store.New(database), ddpClient, bangumiClient, tmdbClient, cacheClient)
	resolverSvc := resolver.New(store.New(database), bangumiClient, ddpClient, cacheClient)
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

	// Scanner for post-download library scan
	sc := scanner.New(store.New(database))

	// HTTP server
	step = time.Now()
	slog.Debug("boot: initializing router")
	notifier := notification.NewService(store.New(database), wsHub, metadataSvc)
	e := api.NewRouter(cfg, database, cacheClient, metadataSvc, matcherSvc, ddpClient, resolverSvc, dlEngine, wsHub, tmdbClient, torrentReg, notifier)
	slog.Debug("boot: router initialized", "took", time.Since(step))

	// Bot engine
	botRouter := bot.NewRouter()
	botSvc := &commands.Services{
		Queries:    store.New(database),
		Metadata:   metadataSvc,
		Downloader: dlEngine,
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

	// Register callbacks (one handler per prefix)
	botRouter.RegisterCallback("detail", commands.DetailCallback(botSvc))
	botRouter.RegisterCallback("sub_pick", commands.SubscribePickCallback(botSvc))
	botRouter.RegisterCallback("sub_do", commands.SubscribeDoCallback(botSvc))
	botRouter.RegisterCallback("dl_pause", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("dl_resume", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("dl_cancel", commands.DownloadControlCallback(botSvc))
	botRouter.RegisterCallback("menu", commands.MenuCallback(botSvc))
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
		store.New(database), dlEngine, sc, matcherSvc, resolverSvc, tmdbClient, cacheClient, notifier, wsHub, botEngine,
	)
	sched.Start()
	slog.Info("boot: scheduler started")

	slog.Info("boot: ready", "total", time.Since(bootStart))

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

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
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := e.Shutdown(ctx); err != nil {
					slog.Error("http shutdown", "err", err)
				}
			}()
			wg.Wait()
			close(done)
		}()

		<-done
		slog.Info("shutdown complete")
		os.Exit(0)
	}()

	addr := fmt.Sprintf(":%d", cfg.APIPort)
	slog.Info("milmil-api starting", "addr", addr, "db", cfg.DatabaseURL)
	if err := e.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server start failed", "err", err)
		os.Exit(1)
	}
}
