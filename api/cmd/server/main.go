package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"

	"net/http"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/migrations"
)

func main() {
	// Logger: zerolog backend wired into slog.
	zl := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).With().Timestamp().Logger()
	logger := slog.New(slogzerolog.Option{Logger: &zl}.NewZerologHandler())
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	// Ensure data directory exists
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		slog.Error("mkdir data", "err", err)
		os.Exit(1)
	}

	// Database
	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("db open", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	// Migrations
	if err := db.MigrateUp(migrations.FS, cfg.DatabaseURL); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	// Cache (Redis or in-memory)
	cacheClient := cache.New(cfg.RedisURL)

	// Metadata service
	httpClient := &http.Client{Timeout: 10 * time.Second}
	bangumiClient := bangumi.NewClient(httpClient, "milmil/1.0")
	anilistClient := anilist.NewClient(httpClient)
	metadataSvc := metadata.New(bangumiClient, anilistClient, cacheClient)

	// HTTP server
	e := api.NewRouter(cfg, database, cacheClient, metadataSvc)

	go func() {
		addr := fmt.Sprintf(":%d", cfg.APIPort)
		slog.Info("milmil-api starting", "addr", addr, "db", cfg.DatabaseURL)
		if err := e.Start(addr); err != nil {
			slog.Info("server stopped", "err", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		slog.Error("shutdown", "err", err)
		os.Exit(1)
	}
}
