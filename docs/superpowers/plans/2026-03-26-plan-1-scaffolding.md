# Plan 1: Project Scaffolding & Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fully running development environment — Go 1.26 API using SQLite by default (zero Docker needed for DB), all 15 tables migrated, aria2 running via Docker, and the React SPA dev server live with zh-Hant as the default locale.

**Architecture:** Monorepo with `api/` (Go) and `web/` (React/Vite 8) as siblings. Database is **SQLite-first** (`modernc.org/sqlite`, pure Go, no CGO) for development and small deployments; switch to PostgreSQL via `DATABASE_URL` env var for production. Both engines use the same portable schema (TEXT UUIDs, TEXT timestamps, TEXT JSON). The `database/sql` interface abstracts the driver. sqlc generates code with the `sqlite` engine (compatible with both). River handles background jobs. Redis is optional (in-memory fallback in dev).

**Tech Stack:** Go 1.26, Echo v4, modernc.org/sqlite, pgx/v5/stdlib (prod), database/sql, golang-migrate, sqlc (sqlite engine), riverqueue/river, go-redis/v9, github.com/google/uuid, koanf/v2 (config), slog+zerolog (logging), Air; Vite 8, Bun, TanStack Router, Lingui v5, Base UI, Tailwind v4, Video.js v10.

**Spec:** `docs/superpowers/specs/2026-03-25-milmil-design.md`

---

## File Map

```
milmil/
├── .gitignore
├── .env.example
├── docker-compose.yml          # aria2 only (SQLite needs no container)
├── docker-compose.prod.yml     # adds postgres, redis for production
│
├── api/
│   ├── go.mod
│   ├── go.sum
│   ├── .air.toml
│   ├── sqlc.yaml
│   ├── Dockerfile
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── config/
│   │   │   ├── config.go       # koanf config (env provider); DB_TYPE: sqlite|postgres
│   │   │   └── config_test.go
│   │   ├── db/
│   │   │   ├── db.go           # opens database/sql connection (sqlite or postgres)
│   │   │   ├── migrate.go      # golang-migrate runner, picks driver from URL scheme
│   │   │   └── db_test.go      # integration: open + migrate + verify tables
│   │   ├── cache/
│   │   │   ├── cache.go        # Cache interface (Get/Set/Del)
│   │   │   ├── redis.go        # Redis implementation
│   │   │   ├── memory.go       # in-memory implementation (dev fallback)
│   │   │   └── cache_test.go
│   │   ├── worker/
│   │   │   └── worker.go       # River client (riversqlite or riverpgxv5 depending on driver)
│   │   ├── store/
│   │   │   └── queries/
│   │   │       └── settings.sql
│   │   └── api/
│   │       ├── router.go
│   │       ├── middleware.go
│   │       ├── health.go
│   │       └── health_test.go
│   └── migrations/
│       ├── 000001_create_users.up.sql / .down.sql
│       ├── 000002_create_settings.up.sql / .down.sql
│       ├── 000003_create_libraries.up.sql / .down.sql
│       ├── 000004_create_anime.up.sql / .down.sql
│       ├── 000005_create_episodes.up.sql / .down.sql
│       ├── 000006_create_media_files.up.sql / .down.sql
│       ├── 000007_create_watch_progress.up.sql / .down.sql
│       ├── 000008_create_subtitle_files.up.sql / .down.sql
│       ├── 000009_create_transcode_sessions.up.sql / .down.sql
│       ├── 000010_create_rss_feeds.up.sql / .down.sql
│       ├── 000011_create_download_rules.up.sql / .down.sql
│       ├── 000012_create_downloads.up.sql / .down.sql
│       ├── 000013_create_playlists.up.sql / .down.sql
│       └── 000014_create_scan_summaries.up.sql / .down.sql
│
└── web/
    ├── package.json
    ├── lingui.config.ts
    ├── vite.config.ts
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    └── src/
        ├── i18n/config.ts
        ├── i18n/language-init.ts
        ├── locales/
        │   ├── zh-Hant/messages.po
        │   ├── zh-Hans/messages.po
        │   └── en/messages.po
        └── lib/
            ├── api-client.ts
            └── api-client.test.ts
```

---

## Task 1: Root Repository Structure

**Files:** `.gitignore`, `.env.example`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Environment
.env
.env.local
*.env.local

# Go
api/vendor/
api/tmp/
*.exe

# SQLite data files
*.db
*.db-shm
*.db-wal
data/

# Node
web/node_modules/
web/dist/

# Docker volumes
downloads/
aria2-config/
transcode-tmp/
pgdata/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Create `.env.example`**

```dotenv
# Database (SQLite by default — no Docker required)
# Format: sqlite:///path/to/file.db  OR  postgres://user:pass@host:5432/db?sslmode=disable
DATABASE_URL=sqlite://data/milmil.db

# Redis (optional — leave empty to use in-memory cache for dev)
REDIS_URL=

# aria2
ARIA2_RPC_URL=http://localhost:6800/jsonrpc
ARIA2_RPC_SECRET=milmil_secret

# API
JWT_SECRET=change_me_in_production_min_32_chars
API_PORT=8080

# Data directory (for SQLite file, subtitle cache, transcode temp)
DATA_DIR=./data

# DandanPlay (register at kaedei@dandanplay.net)
DANDANPLAY_APP_ID=
DANDANPLAY_APP_SECRET=

# Frontend
VITE_API_URL=http://localhost:8080
```

- [ ] **Step 3: Copy to `.env` and create data directory**

```bash
cp .env.example .env
mkdir -p data
```

- [ ] **Step 4: Commit**

```bash
git init
git add .gitignore .env.example
git commit -m "chore: init repository with gitignore and env example"
```

---

## Task 2: Docker Compose (aria2 only for dev)

**Files:** `docker-compose.yml`, `docker-compose.prod.yml`

- [ ] **Step 1: Create `docker-compose.yml`** (dev — aria2 only)

```yaml
services:
  aria2:
    image: p3terx/aria2-pro
    restart: unless-stopped
    environment:
      RPC_SECRET: ${ARIA2_RPC_SECRET:-milmil_secret}
      RPC_PORT: 6800
      LISTEN_PORT: 6888
    volumes:
      - ./downloads:/downloads
      - ./aria2-config:/config
    ports:
      - "6800:6800"
      - "6888:6888"
```

- [ ] **Step 2: Create `docker-compose.prod.yml`** (production — adds postgres + redis)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-milmil}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-milmil}
      POSTGRES_DB: ${POSTGRES_DB:-milmil}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-milmil}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  milmil-api:
    build:
      context: ./api
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-milmil}:${POSTGRES_PASSWORD:-milmil}@postgres:5432/${POSTGRES_DB:-milmil}?sslmode=disable
      REDIS_URL: redis://redis:6379
      ARIA2_RPC_URL: http://aria2:6800/jsonrpc
    volumes:
      - ./data:/app/data
      - ./media:/media
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      aria2:
        condition: service_started

  milmil-web:
    build:
      context: ./web
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - milmil-api

volumes:
  pgdata:
```

- [ ] **Step 3: Start aria2 for development**

```bash
docker compose up aria2 -d
```

Expected: aria2 container starts. Verify: `curl http://localhost:6800/jsonrpc` — should respond (even with auth error, meaning it's up).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "chore: add docker compose — aria2 for dev, postgres+redis for prod"
```

---

## Task 3: Go Module Init

**Files:** `api/go.mod`, `api/cmd/server/main.go`

- [ ] **Step 1: Create directory structure and init module**

```bash
mkdir -p api/cmd/server \
         api/internal/config \
         api/internal/db \
         api/internal/cache \
         api/internal/worker \
         api/internal/store/queries \
         api/internal/api \
         api/migrations \
         data
cd api
go mod init github.com/milmil/api
```

- [ ] **Step 2: Add all dependencies**

```bash
cd api

# Core
go get github.com/labstack/echo/v4@latest
go get github.com/labstack/gommon@latest

# Database — SQLite (pure Go, no CGO) + PostgreSQL
go get modernc.org/sqlite@latest
go get github.com/jackc/pgx/v5@latest                  # stdlib mode for postgres
go get github.com/google/uuid@latest

# Migrations
go get github.com/golang-migrate/migrate/v4@latest

# sqlc runtime
go get github.com/sqlc-dev/sqlc/cmd/sqlc@latest        # CLI only, not a library dep

# Jobs
go get github.com/riverqueue/river@latest
go get github.com/riverqueue/river/riverdriver/riversqlite@latest
go get github.com/riverqueue/river/riverdriver/riverpgxv5@latest

# Cache
go get github.com/redis/go-redis/v9@latest

# Auth & config
go get github.com/knadh/koanf/v2@latest
go get github.com/knadh/koanf/providers/env@latest
go get github.com/knadh/koanf/providers/confmap@latest
go get github.com/golang-jwt/jwt/v5@latest
go get golang.org/x/crypto@latest
go get github.com/go-playground/validator/v10@latest

# Logging (slog + zerolog backend)
go get github.com/rs/zerolog@latest
go get github.com/samber/slog-zerolog/v2@latest

# Testing
go get github.com/stretchr/testify@latest

go mod tidy
```

- [ ] **Step 3: Create `api/cmd/server/main.go`**

```go
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

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
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
	if err := db.MigrateUp(cfg.DatabaseURL); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	// Cache (Redis or in-memory)
	cacheClient := cache.New(cfg.RedisURL)

	// HTTP server
	e := api.NewRouter(cfg, database, cacheClient)

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
```

- [ ] **Step 4: Commit**

```bash
cd api && go mod tidy
git add api/go.mod api/go.sum api/cmd/
git commit -m "chore: init go module with all dependencies"
```

---

## Task 4: Config System

**Files:** `api/internal/config/config.go`, `api/internal/config/config_test.go`

- [ ] **Step 1: Write the failing test**

`api/internal/config/config_test.go`:

```go
package config_test

import (
	"os"
	"testing"

	"github.com/milmil/api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestLoad_SQLiteDefault(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite://data/test.db")
	t.Setenv("JWT_SECRET", "test_secret_at_least_32_characters!")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, "sqlite://data/test.db", cfg.DatabaseURL)
	require.Equal(t, "sqlite", cfg.DBDriver())
	require.Equal(t, 8080, cfg.APIPort)
}

func TestLoad_PostgresURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db?sslmode=disable")
	t.Setenv("JWT_SECRET", "test_secret_at_least_32_characters!")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, "postgres", cfg.DBDriver())
}

func TestLoad_MissingRequired(t *testing.T) {
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("JWT_SECRET")

	_, err := config.Load()
	require.Error(t, err)
}

func TestLoad_RedisOptional(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite://data/test.db")
	t.Setenv("JWT_SECRET", "secret")
	os.Unsetenv("REDIS_URL")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.Empty(t, cfg.RedisURL) // Redis is optional
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/config/... -v
```

Expected: FAIL — package missing.

- [ ] **Step 3: Implement `api/internal/config/config.go`**

```go
package config

import (
	"fmt"
	"strings"

	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/v2"
)

type Config struct {
	DatabaseURL         string
	RedisURL            string // optional
	JWTSecret           string
	APIPort             int
	DataDir             string
	Aria2RPCURL         string
	Aria2RPCSecret      string
	DandanPlayAppID     string
	DandanPlayAppSecret string
}

// DBDriver returns "sqlite" or "postgres" based on the DATABASE_URL scheme.
func (c *Config) DBDriver() string {
	if strings.HasPrefix(c.DatabaseURL, "postgres") {
		return "postgres"
	}
	return "sqlite"
}

// Load reads configuration from environment variables using koanf.
func Load() (*Config, error) {
	k := koanf.New(".")

	// Defaults via a map provider.
	defaults := map[string]any{
		"API_PORT":        8080,
		"DATA_DIR":        "./data",
		"DATABASE_URL":    "sqlite://data/milmil.db",
		"ARIA2_RPC_URL":   "http://localhost:6800/jsonrpc",
		"ARIA2_RPC_SECRET": "",
		"REDIS_URL":       "",
	}
	if err := k.Load(confmap.Provider(defaults, "."), nil); err != nil {
		return nil, fmt.Errorf("defaults: %w", err)
	}

	// Override with environment variables (identity transform — keys stay uppercase).
	if err := k.Load(env.Provider("", ".", func(s string) string { return s }), nil); err != nil {
		return nil, fmt.Errorf("env: %w", err)
	}

	cfg := &Config{
		DatabaseURL:         k.String("DATABASE_URL"),
		RedisURL:            k.String("REDIS_URL"),
		JWTSecret:           k.String("JWT_SECRET"),
		APIPort:             k.Int("API_PORT"),
		DataDir:             k.String("DATA_DIR"),
		Aria2RPCURL:         k.String("ARIA2_RPC_URL"),
		Aria2RPCSecret:      k.String("ARIA2_RPC_SECRET"),
		DandanPlayAppID:     k.String("DANDANPLAY_APP_ID"),
		DandanPlayAppSecret: k.String("DANDANPLAY_APP_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	return cfg, nil
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd api && go test ./internal/config/... -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/internal/config/
git commit -m "feat: add config with sqlite-first db driver detection"
```

---

## Task 5: Database Connection & Migrations

**Files:** `api/internal/db/db.go`, `api/internal/db/migrate.go`, `api/internal/db/db_test.go`

- [ ] **Step 1: Write the failing test**

`api/internal/db/db_test.go`:

```go
//go:build integration

package db_test

import (
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/stretchr/testify/require"
)

// Uses a temp SQLite file so no external DB is needed.
const testDSN = "sqlite://file::memory:?cache=shared&mode=memory"

func TestOpen_SQLite(t *testing.T) {
	database, err := db.Open(testDSN)
	require.NoError(t, err)
	defer database.Close()

	err = database.Ping()
	require.NoError(t, err)
}

func TestMigrateUp_AllTablesExist(t *testing.T) {
	// Use a unique in-memory DB per test run
	dsn := "sqlite://file:testmigrate?mode=memory&cache=shared"
	err := db.MigrateUp(dsn)
	require.NoError(t, err)

	database, err := db.Open(dsn)
	require.NoError(t, err)
	defer database.Close()

	tables := []string{
		"users", "settings", "libraries", "anime", "episodes",
		"media_files", "watch_progress", "subtitle_files",
		"transcode_sessions", "rss_feeds", "download_rules",
		"downloads", "playlists", "playlist_entries", "scan_summaries",
	}
	for _, table := range tables {
		var count int
		err = database.QueryRow(
			"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table,
		).Scan(&count)
		require.NoError(t, err, "querying table %s", table)
		require.Equal(t, 1, count, "table %s should exist after migration", table)
	}
}
```

> **Note:** This test uses SQLite in-memory mode — no Docker, no external process needed. Run anywhere.

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test -tags=integration ./internal/db/... -v
```

Expected: FAIL — package missing.

- [ ] **Step 3: Implement `api/internal/db/db.go`**

```go
package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib" // postgres driver: "pgx"
	_ "modernc.org/sqlite"              // sqlite driver: "sqlite"
)

// Open creates a database/sql connection for either SQLite or PostgreSQL.
// DSN format: "sqlite://path/to/file.db" or "postgres://..."
func Open(dsn string) (*sql.DB, error) {
	driver, dataSourceName, err := parseDSN(dsn)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open(driver, dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("sql.Open(%s): %w", driver, err)
	}

	// SQLite: single writer, multiple readers
	if driver == "sqlite" {
		db.SetMaxOpenConns(1)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("db ping (%s): %w", driver, err)
	}
	return db, nil
}

// parseDSN converts a milmil-style DSN to a driver name + data source name.
func parseDSN(dsn string) (driver, dataSourceName string, err error) {
	switch {
	case strings.HasPrefix(dsn, "sqlite://"):
		// sqlite://./data/milmil.db  →  driver="sqlite", dsn="./data/milmil.db"
		// sqlite://file::memory:?...  →  driver="sqlite", dsn="file::memory:?..."
		raw := strings.TrimPrefix(dsn, "sqlite://")
		return "sqlite", raw, nil
	case strings.HasPrefix(dsn, "postgres://"), strings.HasPrefix(dsn, "postgresql://"):
		return "pgx", dsn, nil
	default:
		return "", "", fmt.Errorf("unsupported database URL scheme: %q", dsn)
	}
}
```

- [ ] **Step 4: Implement `api/internal/db/migrate.go`**

```go
package db

import (
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // postgres
	_ "github.com/golang-migrate/migrate/v4/database/sqlite"  // sqlite (modernc, no CGO)
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// MigrateUp runs all pending up migrations from the embedded migrations directory.
// migrationsPath defaults to "migrations" relative to the working directory.
func MigrateUp(dsn string) error {
	migrateURL := toMigrateURL(dsn)

	m, err := migrate.New("file://migrations", migrateURL)
	if err != nil {
		return fmt.Errorf("migrate.New: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// toMigrateURL converts milmil DSN format to golang-migrate database URL format.
func toMigrateURL(dsn string) string {
	if strings.HasPrefix(dsn, "sqlite://") {
		// golang-migrate sqlite driver expects: sqlite://path/to/file.db
		return dsn
	}
	// postgres DSN is passed through unchanged
	return dsn
}
```

> **Note on test CWD:** The integration test runs from `api/internal/db/` but migration files are in `api/migrations/`. Run integration tests from `api/` root:
> ```bash
> cd api && go test -tags=integration ./internal/db/... -v
> ```
> This ensures `file://migrations` resolves to `api/migrations/`.

- [ ] **Step 5: Run test (will pass Ping, fail MigrateUp since no migration files yet)**

```bash
cd api && go test -tags=integration ./internal/db/... -run TestOpen_SQLite -v
```

Expected: `TestOpen_SQLite` PASSES. `TestMigrateUp_AllTablesExist` will be verified after Task 6.

- [ ] **Step 6: Commit**

```bash
git add api/internal/db/
git commit -m "feat: add sqlite-first db open + migrate runner"
```

---

## Task 6: Database Migrations (All 15 Tables — portable SQL)

All migrations use portable SQL (TEXT UUIDs, TEXT timestamps, TEXT JSON, INTEGER booleans). UUIDs are generated by the Go application before INSERT — no `gen_random_uuid()`.

- [ ] **Step 1: Migration 000001 — users**

`api/migrations/000001_create_users.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

`api/migrations/000001_create_users.down.sql`:
```sql
DROP TABLE IF EXISTS users;
```

- [ ] **Step 2: Migration 000002 — settings**

`api/migrations/000002_create_settings.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('general',    '{}'),
    ('dandanplay', '{}'),
    ('bangumi',    '{}'),
    ('anilist',    '{}'),
    ('mal',        '{}'),
    ('player',     '{"danmaku_enabled":true,"danmaku_opacity":80,"danmaku_font_size":20,"danmaku_speed":"normal","danmaku_max_density":50,"danmaku_show_scroll":true,"danmaku_show_top":true,"danmaku_show_bottom":true,"danmaku_include_ext":false,"danmaku_keyword_filters":[]}'),
    ('appearance', '{"locale":"zh-Hant","theme":"dark"}');
```

`api/migrations/000002_create_settings.down.sql`:
```sql
DROP TABLE IF EXISTS settings;
```

- [ ] **Step 3: Migration 000003 — libraries**

`api/migrations/000003_create_libraries.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS libraries (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    path                  TEXT NOT NULL,
    enabled               INTEGER NOT NULL DEFAULT 1,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 60,
    last_scanned_at       TEXT,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

`api/migrations/000003_create_libraries.down.sql`:
```sql
DROP TABLE IF EXISTS libraries;
```

- [ ] **Step 4: Migration 000004 — anime**

`api/migrations/000004_create_anime.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS anime (
    id                    TEXT PRIMARY KEY,
    library_id            TEXT REFERENCES libraries(id) ON DELETE SET NULL,
    title                 TEXT NOT NULL,
    title_zh              TEXT,
    title_en              TEXT,
    synopsis              TEXT,
    cover_image_url       TEXT,
    total_episodes        INTEGER,
    status                TEXT NOT NULL DEFAULT 'unknown',
    air_date              TEXT,
    year                  INTEGER,
    season                TEXT,
    genres                TEXT NOT NULL DEFAULT '[]',
    is_custom             INTEGER NOT NULL DEFAULT 0,
    anilist_id            INTEGER,
    bangumi_id            INTEGER,
    dandanplay_bangumi_id INTEGER,
    mal_id                INTEGER,
    tmdb_id               INTEGER,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_anime_library_id  ON anime(library_id);
CREATE INDEX IF NOT EXISTS idx_anime_anilist_id  ON anime(anilist_id);
CREATE INDEX IF NOT EXISTS idx_anime_bangumi_id  ON anime(bangumi_id);
CREATE INDEX IF NOT EXISTS idx_anime_status      ON anime(status);
CREATE INDEX IF NOT EXISTS idx_anime_year_season ON anime(year, season);
```

`api/migrations/000004_create_anime.down.sql`:
```sql
DROP TABLE IF EXISTS anime;
```

- [ ] **Step 5: Migration 000005 — episodes**

`api/migrations/000005_create_episodes.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS episodes (
    id                    TEXT PRIMARY KEY,
    anime_id              TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    episode_number        REAL NOT NULL,
    title                 TEXT,
    title_zh              TEXT,
    air_date              TEXT,
    synopsis              TEXT,
    thumbnail_url         TEXT,
    dandanplay_episode_id INTEGER,
    bangumi_episode_id    INTEGER,
    mal_episode_id        INTEGER,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (anime_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime_id              ON episodes(anime_id);
CREATE INDEX IF NOT EXISTS idx_episodes_dandanplay_episode_id ON episodes(dandanplay_episode_id);
```

`api/migrations/000005_create_episodes.down.sql`:
```sql
DROP TABLE IF EXISTS episodes;
```

- [ ] **Step 6: Migration 000006 — media_files**

`api/migrations/000006_create_media_files.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS media_files (
    id                    TEXT PRIMARY KEY,
    episode_id            TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    library_id            TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    path                  TEXT NOT NULL UNIQUE,
    filename              TEXT NOT NULL,
    size_bytes            INTEGER NOT NULL DEFAULT 0,
    duration_seconds      INTEGER,
    container_format      TEXT,
    video_codec           TEXT,
    audio_codec           TEXT,
    width                 INTEGER,
    height                INTEGER,
    file_hash             TEXT,
    dandanplay_episode_id INTEGER,
    match_status          TEXT NOT NULL DEFAULT 'unmatched',
    video_tracks          TEXT NOT NULL DEFAULT '[]',
    audio_tracks          TEXT NOT NULL DEFAULT '[]',
    subtitle_tracks       TEXT NOT NULL DEFAULT '[]',
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_media_files_episode_id            ON media_files(episode_id);
CREATE INDEX IF NOT EXISTS idx_media_files_library_id            ON media_files(library_id);
CREATE INDEX IF NOT EXISTS idx_media_files_file_hash             ON media_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_media_files_match_status          ON media_files(match_status);
CREATE INDEX IF NOT EXISTS idx_media_files_dandanplay_episode_id ON media_files(dandanplay_episode_id);
```

`api/migrations/000006_create_media_files.down.sql`:
```sql
DROP TABLE IF EXISTS media_files;
```

- [ ] **Step 7: Migration 000007 — watch_progress**

`api/migrations/000007_create_watch_progress.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS watch_progress (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id        TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    media_file_id     TEXT REFERENCES media_files(id) ON DELETE SET NULL,
    position_seconds  INTEGER NOT NULL DEFAULT 0,
    duration_seconds  INTEGER,
    completed         INTEGER NOT NULL DEFAULT 0,
    last_watched_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    bangumi_synced_at TEXT,
    mal_synced_at     TEXT,
    anilist_synced_at TEXT,
    UNIQUE (user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_progress_user_id    ON watch_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_episode_id ON watch_progress(episode_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_completed  ON watch_progress(user_id, completed);
```

`api/migrations/000007_create_watch_progress.down.sql`:
```sql
DROP TABLE IF EXISTS watch_progress;
```

- [ ] **Step 8: Migration 000008 — subtitle_files**

`api/migrations/000008_create_subtitle_files.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS subtitle_files (
    id            TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    language      TEXT NOT NULL,
    format        TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'local',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_subtitle_files_media_file_id ON subtitle_files(media_file_id);
```

`api/migrations/000008_create_subtitle_files.down.sql`:
```sql
DROP TABLE IF EXISTS subtitle_files;
```

- [ ] **Step 9: Migration 000009 — transcode_sessions**

`api/migrations/000009_create_transcode_sessions.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS transcode_sessions (
    id            TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending',
    output_dir    TEXT NOT NULL,
    codec         TEXT,
    resolution    TEXT,
    progress      INTEGER NOT NULL DEFAULT 0,
    expires_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_transcode_sessions_token   ON transcode_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_transcode_sessions_expires ON transcode_sessions(expires_at);
```

`api/migrations/000009_create_transcode_sessions.down.sql`:
```sql
DROP TABLE IF EXISTS transcode_sessions;
```

- [ ] **Step 10: Migration 000010 — rss_feeds**

`api/migrations/000010_create_rss_feeds.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS rss_feeds (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL,
    url                    TEXT NOT NULL,
    type                   TEXT NOT NULL DEFAULT 'custom',
    enabled                INTEGER NOT NULL DEFAULT 1,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
    last_fetched_at        TEXT,
    created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

`api/migrations/000010_create_rss_feeds.down.sql`:
```sql
DROP TABLE IF EXISTS rss_feeds;
```

- [ ] **Step 11: Migration 000011 — download_rules**

`api/migrations/000011_create_download_rules.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS download_rules (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    enabled           INTEGER NOT NULL DEFAULT 1,
    rss_feed_id       TEXT NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
    filter_regex      TEXT NOT NULL DEFAULT '',
    exclude_regex     TEXT NOT NULL DEFAULT '',
    save_dir          TEXT NOT NULL DEFAULT '',
    episode_offset    INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_download_rules_rss_feed_id ON download_rules(rss_feed_id);
CREATE INDEX IF NOT EXISTS idx_download_rules_enabled     ON download_rules(enabled);
```

`api/migrations/000011_create_download_rules.down.sql`:
```sql
DROP TABLE IF EXISTS download_rules;
```

- [ ] **Step 12: Migration 000012 — downloads**

`api/migrations/000012_create_downloads.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS downloads (
    id              TEXT PRIMARY KEY,
    gid             TEXT NOT NULL UNIQUE,
    url             TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'waiting',
    total_bytes     INTEGER NOT NULL DEFAULT 0,
    completed_bytes INTEGER NOT NULL DEFAULT 0,
    speed_bytes     INTEGER NOT NULL DEFAULT 0,
    save_dir        TEXT NOT NULL DEFAULT '',
    rule_id         TEXT REFERENCES download_rules(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_rule_id ON downloads(rule_id);
```

`api/migrations/000012_create_downloads.down.sql`:
```sql
DROP TABLE IF EXISTS downloads;
```

- [ ] **Step 13: Migration 000013 — playlists + playlist_entries**

`api/migrations/000013_create_playlists.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS playlists (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    cover_image_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS playlist_entries (
    id          TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    episode_id  TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (playlist_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist_id ON playlist_entries(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_position    ON playlist_entries(playlist_id, position);
```

`api/migrations/000013_create_playlists.down.sql`:
```sql
DROP TABLE IF EXISTS playlist_entries;
DROP TABLE IF EXISTS playlists;
```

- [ ] **Step 14: Migration 000014 — scan_summaries**

`api/migrations/000014_create_scan_summaries.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS scan_summaries (
    id              TEXT PRIMARY KEY,
    library_id      TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    completed_at    TEXT,
    files_found     INTEGER NOT NULL DEFAULT 0,
    files_matched   INTEGER NOT NULL DEFAULT 0,
    files_unmatched INTEGER NOT NULL DEFAULT 0,
    errors          TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_scan_summaries_library_id ON scan_summaries(library_id);
CREATE INDEX IF NOT EXISTS idx_scan_summaries_started_at ON scan_summaries(started_at);
```

`api/migrations/000014_create_scan_summaries.down.sql`:
```sql
DROP TABLE IF EXISTS scan_summaries;
```

- [ ] **Step 15: Run full migration integration test**

```bash
cd api && go test -tags=integration ./internal/db/... -v
```

Expected: both `TestOpen_SQLite` and `TestMigrateUp_AllTablesExist` PASS. No external services required.

- [ ] **Step 16: Commit**

```bash
git add api/migrations/
git commit -m "feat: add 14 portable migrations (15 tables, sqlite+postgres compatible)"
```

---

## Task 7: sqlc Setup

**Files:** `api/sqlc.yaml`, `api/internal/store/queries/settings.sql`

- [ ] **Step 1: Install sqlc CLI**

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
sqlc version
```

- [ ] **Step 2: Create `api/sqlc.yaml`**

```yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "internal/store/queries/"
    schema: "migrations/"
    gen:
      go:
        package: "store"
        out: "internal/store"
        sql_package: "database/sql"
        emit_json_tags: true
        emit_prepared_queries: false
        emit_interface: true
        emit_exact_table_names: false
        emit_empty_slices: true
        overrides:
          - db_type: "text"
            go_type: "string"
          - db_type: "integer"
            go_type: "int64"
          - db_type: "real"
            go_type: "float64"
```

- [ ] **Step 3: Create `api/internal/store/queries/settings.sql`**

```sql
-- name: GetSetting :one
SELECT key, value, updated_at FROM settings WHERE key = ?;

-- name: UpsertSetting :one
INSERT INTO settings (key, value, updated_at)
VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT (key) DO UPDATE
  SET value = excluded.value,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: ListSettings :many
SELECT key, value, updated_at FROM settings ORDER BY key;
```

- [ ] **Step 4: Generate sqlc code**

```bash
cd api && sqlc generate
```

Expected: `internal/store/` now contains `db.go`, `models.go`, `querier.go`, `settings.sql.go`.

- [ ] **Step 5: Verify generated code compiles**

```bash
cd api && go build ./...
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/sqlc.yaml api/internal/store/
git commit -m "feat: add sqlc config (sqlite engine, database/sql) and settings queries"
```

---

## Task 8: Cache Abstraction (Redis + in-memory fallback)

**Files:** `api/internal/cache/cache.go`, `api/internal/cache/redis.go`, `api/internal/cache/memory.go`, `api/internal/cache/cache_test.go`

- [ ] **Step 1: Write failing tests**

`api/internal/cache/cache_test.go`:

```go
package cache_test

import (
	"context"
	"testing"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/stretchr/testify/require"
)

// Tests run against in-memory cache — no external services needed.
func TestMemoryCache_SetGet(t *testing.T) {
	c := cache.New("") // empty REDIS_URL → in-memory
	ctx := context.Background()

	err := c.Set(ctx, "key1", []byte("hello"), 5*time.Second)
	require.NoError(t, err)

	val, err := c.Get(ctx, "key1")
	require.NoError(t, err)
	require.Equal(t, []byte("hello"), val)
}

func TestMemoryCache_Miss(t *testing.T) {
	c := cache.New("")
	_, err := c.Get(context.Background(), "missing")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}

func TestMemoryCache_TTLExpiry(t *testing.T) {
	c := cache.New("")
	ctx := context.Background()

	err := c.Set(ctx, "expiring", []byte("val"), 50*time.Millisecond)
	require.NoError(t, err)

	time.Sleep(100 * time.Millisecond)
	_, err = c.Get(ctx, "expiring")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}

func TestMemoryCache_Del(t *testing.T) {
	c := cache.New("")
	ctx := context.Background()
	_ = c.Set(ctx, "del_key", []byte("v"), time.Minute)
	err := c.Del(ctx, "del_key")
	require.NoError(t, err)
	_, err = c.Get(ctx, "del_key")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/cache/... -v
```

Expected: FAIL — package missing.

- [ ] **Step 3: Implement `api/internal/cache/cache.go`**

```go
package cache

import (
	"context"
	"errors"
	"time"
)

// ErrCacheMiss is returned when a key is not found or has expired.
var ErrCacheMiss = errors.New("cache miss")

// Cache is a simple key-value cache interface.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Del(ctx context.Context, key string) error
	Close() error
}

// New returns a Redis-backed cache if redisURL is non-empty,
// or an in-memory cache otherwise (suitable for development).
func New(redisURL string) Cache {
	if redisURL != "" {
		if c, err := newRedisCache(redisURL); err == nil {
			return c
		}
	}
	return newMemoryCache()
}
```

- [ ] **Step 4: Implement `api/internal/cache/memory.go`**

```go
package cache

import (
	"context"
	"sync"
	"time"
)

type memoryEntry struct {
	value     []byte
	expiresAt time.Time
}

type memoryCache struct {
	mu      sync.RWMutex
	entries map[string]memoryEntry
}

func newMemoryCache() *memoryCache {
	return &memoryCache{entries: make(map[string]memoryEntry)}
}

func (m *memoryCache) Get(_ context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	entry, ok := m.entries[key]
	m.mu.RUnlock()
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, ErrCacheMiss
	}
	return entry.value, nil
}

func (m *memoryCache) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	m.mu.Lock()
	m.entries[key] = memoryEntry{value: value, expiresAt: time.Now().Add(ttl)}
	m.mu.Unlock()
	return nil
}

func (m *memoryCache) Del(_ context.Context, key string) error {
	m.mu.Lock()
	delete(m.entries, key)
	m.mu.Unlock()
	return nil
}

func (m *memoryCache) Close() error { return nil }
```

- [ ] **Step 5: Implement `api/internal/cache/redis.go`**

```go
package cache

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type redisCache struct {
	client *redis.Client
}

func newRedisCache(redisURL string) (*redisCache, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis.ParseURL: %w", err)
	}
	c := redis.NewClient(opts)
	if err := c.Ping(context.Background()).Err(); err != nil {
		c.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &redisCache{client: c}, nil
}

func (r *redisCache) Get(ctx context.Context, key string) ([]byte, error) {
	val, err := r.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrCacheMiss
	}
	return val, err
}

func (r *redisCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

func (r *redisCache) Del(ctx context.Context, key string) error {
	return r.client.Del(ctx, key).Err()
}

func (r *redisCache) Close() error {
	return r.client.Close()
}
```

- [ ] **Step 6: Run tests to verify all pass**

```bash
cd api && go test ./internal/cache/... -v
```

Expected: all 4 tests PASS (in-memory, no Redis needed).

- [ ] **Step 7: Commit**

```bash
git add api/internal/cache/
git commit -m "feat: add cache abstraction with redis + in-memory fallback"
```

---

## Task 9: River Job Queue Setup

**Files:** `api/internal/worker/worker.go`

- [ ] **Step 1: Create `api/internal/worker/worker.go`**

```go
package worker

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riversqlite"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/jackc/pgx/v5"
)

// Workers holds the River workers registry.
// Job workers are added in Plans 3–6 via river.AddWorker(Workers, &MyWorker{}).
var Workers = river.NewWorkers()

// NewClient creates a River client for either SQLite or PostgreSQL.
// databaseURL scheme determines which driver to use.
func NewClient(ctx context.Context, db *sql.DB, databaseURL string) (*river.Client[*sql.Tx], error) {
	if strings.HasPrefix(databaseURL, "postgres") {
		return newPostgresClient(ctx, databaseURL)
	}
	return newSQLiteClient(db)
}

func newSQLiteClient(db *sql.DB) (*river.Client[*sql.Tx], error) {
	client, err := river.NewClient(riversqlite.New(db), &river.Config{
		Workers: Workers,
	})
	if err != nil {
		return nil, fmt.Errorf("river sqlite client: %w", err)
	}
	return client, nil
}

func newPostgresClient(ctx context.Context, databaseURL string) (*river.Client[pgx.Tx], error) {
	// This function is only called for postgres — handled separately in prod.
	// Returning a typed error so callers know to use the pgx path.
	return nil, fmt.Errorf("use NewPgxClient for postgres: %s", databaseURL)
}
```

> **Note:** River's SQLite and PostgreSQL clients have different Tx type parameters (`*sql.Tx` vs `pgx.Tx`). For Phase 1 (SQLite), only the `*sql.Tx` client is used. PostgreSQL support is wired in production deployments via a build flag or runtime branch in a later plan.

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd api && go build ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/internal/worker/
git commit -m "feat: add river job queue setup (sqlite-first)"
```

---

## Task 10: Echo API Server & Health Endpoint

**Files:** `api/internal/api/router.go`, `api/internal/api/middleware.go`, `api/internal/api/health.go`, `api/internal/api/health_test.go`

- [ ] **Step 1: Write the failing test**

`api/internal/api/health_test.go`:

```go
package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestHealthEndpoint(t *testing.T) {
	cfg := &config.Config{
		APIPort:     8080,
		JWTSecret:  "test",
		DatabaseURL: "sqlite://data/test.db",
	}
	e := api.NewRouter(cfg, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"status":"ok"`)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/api/... -v
```

Expected: FAIL.

- [ ] **Step 3: Implement `api/internal/api/health.go`**

```go
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func handleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"version": "1.0.0",
	})
}
```

- [ ] **Step 4: Implement `api/internal/api/middleware.go`**

```go
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func attachMiddleware(e *echo.Echo) {
	e.Use(middleware.Recover())
	e.Use(middleware.Logger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
		},
		AllowMethods: []string{
			http.MethodGet, http.MethodPost, http.MethodPut,
			http.MethodDelete, http.MethodOptions,
		},
	}))
}
```

- [ ] **Step 5: Implement `api/internal/api/router.go`**

```go
package api

import (
	"database/sql"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
)

// NewRouter creates the Echo instance with all middleware and routes.
// db and cacheClient may be nil in tests that don't need them.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	e.GET("/health", handleHealth)

	// v1 API group — handlers registered in Plans 2–8
	// v1 := e.Group("/api/v1")

	return e
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd api && go test ./internal/api/... -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/api/
git commit -m "feat: add echo router with cors, logger, recovery, health endpoint"
```

---

## Task 11: Air Hot Reload + API Dockerfile

**Files:** `api/.air.toml`, `api/Dockerfile`

- [ ] **Step 1: Install Air and create `.air.toml`**

```bash
go install github.com/air-verse/air@latest
```

`api/.air.toml`:
```toml
root = "."
tmp_dir = "tmp"

[build]
  cmd = "go build -o ./tmp/server ./cmd/server"
  bin = "./tmp/server"
  include_ext = ["go", "tpl", "tmpl", "html", "sql"]
  exclude_dir = ["tmp", "vendor", "testdata", "internal/store"]
  delay = 1000
  stop_on_error = true

[log]
  time = false

[color]
  main   = "magenta"
  build  = "yellow"
  runner = "green"

[misc]
  clean_on_exit = true
```

- [ ] **Step 2: Create `api/Dockerfile`**

```dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ffmpeg ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server /app/server
COPY migrations/ /app/migrations/
EXPOSE 8080
CMD ["/app/server"]
```

> **Note:** `CGO_ENABLED=0` works because `modernc.org/sqlite` is pure Go. No CGO required.

- [ ] **Step 3: Verify Air starts the server**

```bash
cd api && DATABASE_URL=sqlite://data/milmil.db JWT_SECRET=devsecret air
```

Expected: compiles, runs migrations, starts on `:8080`. Verify:
```bash
curl http://localhost:8080/health
# → {"status":"ok","version":"1.0.0"}
```

- [ ] **Step 4: Commit**

```bash
git add api/.air.toml api/Dockerfile
git commit -m "chore: add air hot reload config and dockerfile (no CGO)"
```

---

## Task 12: Frontend Bootstrap

**Files:** `web/` (from template), modifications to lingui config and i18n

- [ ] **Step 1: Copy template**

```bash
cp -r /Users/niskan516/Sync/Workspace/dev/template/web-template/tanstack-spa/. web/
rm -rf web/dist web/node_modules
```

- [ ] **Step 2: Update `web/package.json` — name and Video.js**

Change name: `"name": "milmil-web"`

```bash
cd web
bun add video.js@^10
bun add --dev @types/video.js
```

- [ ] **Step 3: Update `web/lingui.config.ts`**

```typescript
import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['zh-Hant', 'zh-Hans', 'en'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['<rootDir>/src'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  ],
  format: formatter(),
  orderBy: 'message',
});
```

- [ ] **Step 4: Replace `web/src/i18n/config.ts`**

```typescript
import { i18n } from '@lingui/core';

const rtlLanguages = ['he', 'fa', 'ur'];

function onLocaleChange(locale: string) {
  const dir = rtlLanguages.includes(locale) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
}

async function loadAndActivate(locale: string): Promise<void> {
  try {
    const { messages } = await import(`../locales/${locale}/messages.ts`);
    i18n.loadAndActivate({ locale, messages });
    onLocaleChange(locale);
  } catch (error) {
    console.error(`Failed to load locale: ${locale}`, error);
    if (locale !== 'zh-Hant') {
      await loadAndActivate('zh-Hant');
    }
  }
}

export const availableLanguages = [
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'en', label: 'English' },
];

export const defaultLocale = 'zh-Hant';

export const isRTL = (lng?: string): boolean =>
  !!lng && rtlLanguages.includes(lng);

export default i18n;
export { i18n, loadAndActivate, onLocaleChange };
```

- [ ] **Step 5: Replace `web/src/i18n/language-init.ts`**

Find the existing `initializeLanguage` function signature in the template and update it to match. The template calls `initializeLanguage(savedLanguage)` with one argument — update the function to accept and use it:

```typescript
import { defaultLocale, loadAndActivate } from './config';

// Accepts an optional saved locale (from localStorage or external caller).
// Falls back to defaultLocale (zh-Hant) if none provided.
export async function initializeLanguage(savedLanguage?: string | null): Promise<void> {
  const locale = savedLanguage ?? localStorage.getItem('milmil-locale') ?? defaultLocale;
  await loadAndActivate(locale);
}
```

- [ ] **Step 6: Create locale files**

`web/src/locales/zh-Hant/messages.po`:
```po
msgid ""
msgstr ""
"Content-Type: text/plain; charset=utf-8\n"
"Content-Transfer-Encoding: 8bit\n"
"Language: zh-Hant\n"
"Plural-Forms: nplurals=1; plural=0;\n"
```

`web/src/locales/zh-Hans/messages.po`:
```po
msgid ""
msgstr ""
"Content-Type: text/plain; charset=utf-8\n"
"Content-Transfer-Encoding: 8bit\n"
"Language: zh-Hans\n"
"Plural-Forms: nplurals=1; plural=0;\n"
```

- [ ] **Step 7: Create `web/.env.example` and `.env`**

```dotenv
VITE_API_URL=http://localhost:8080
```

```bash
cp web/.env.example web/.env
```

- [ ] **Step 8: Compile Lingui catalogs**

```bash
cd web && bun run i18n:compile
```

Expected: `messages.ts` generated in each locale directory.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat: bootstrap web from tanstack-spa template with video.js and zh-Hant/zh-Hans"
```

---

## Task 13: Frontend API Client + Dockerfile

**Files:** `web/src/lib/api-client.ts`, `web/src/lib/api-client.test.ts`, `web/Dockerfile`, `web/nginx.conf`

- [ ] **Step 1: Create `web/src/lib/api-client.ts`**

```typescript
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('milmil-token');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body?: unknown)    => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown)    => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                   => request<T>(path, { method: 'DELETE' }),
};

export interface HealthResponse { status: string; version: string; }
export const getHealth = () => api.get<HealthResponse>('/health');
```

- [ ] **Step 2: Write unit test**

`web/src/lib/api-client.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';

describe('ApiError', () => {
  it('preserves status and message', () => {
    const err = new ApiError(404, 'not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 3: Run frontend tests**

```bash
cd web && bun run test:run
```

Expected: PASS.

- [ ] **Step 4: Create `web/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://milmil-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 5: Create `web/Dockerfile`**

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run i18n:compile && bun run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ web/Dockerfile web/nginx.conf
git commit -m "feat: add typed api client and web dockerfile"
```

---

## Task 14: End-to-End Smoke Test

- [ ] **Step 1: Run all Go unit tests**

```bash
cd api && go test ./...
```

Expected: all PASS (no external services needed).

- [ ] **Step 2: Run integration tests (SQLite in-memory — no Docker)**

```bash
cd api && go test -tags=integration ./...
```

Expected: all PASS. The DB integration tests use SQLite in-memory; no external services needed.

- [ ] **Step 3: Start API with Air**

```bash
cd api && DATABASE_URL=sqlite://data/milmil.db JWT_SECRET=devsecret32chars air
```

Expected: migrations run, server starts on `:8080`.

- [ ] **Step 4: Verify health endpoint**

```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok","version":"1.0.0"}`

- [ ] **Step 5: Start frontend dev server**

```bash
cd web && bun dev
```

Expected: Vite dev server starts. Open browser — template app renders, no console errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: plan 1 complete — sqlite-first dev environment running"
```

---

## Completion Checklist

- [ ] `.gitignore` and `.env.example` at root
- [ ] `docker-compose.yml` (aria2 only for dev)
- [ ] `docker-compose.prod.yml` (postgres + redis + all services)
- [ ] Go 1.26 module with all dependencies
- [ ] Config system with `DBDriver()` detecting sqlite vs postgres
- [ ] `db.Open()` supporting `sqlite://` and `postgres://` DSNs
- [ ] `db.MigrateUp()` running portable migrations
- [ ] 14 migration files creating 15 tables (portable SQL, no PostgreSQL-specific types)
- [ ] sqlc configured for `sqlite` engine with `database/sql` package
- [ ] Cache abstraction: Redis when `REDIS_URL` set, in-memory otherwise
- [ ] River job queue setup for SQLite driver
- [ ] Echo router with `/health` endpoint
- [ ] Air `.air.toml` (CGO_ENABLED=0, pure Go)
- [ ] `api/Dockerfile` with FFmpeg (no CGO)
- [ ] Frontend from tanstack-spa template with Video.js
- [ ] Lingui: `zh-Hant` (default), `zh-Hans`, `en` catalogs
- [ ] Typed API client in `web/src/lib/api-client.ts`
- [ ] `web/Dockerfile` with Nginx
- [ ] All Go tests pass with **no external services** (`go test ./...` and `go test -tags=integration ./...`)
- [ ] `curl http://localhost:8080/health` → 200 OK
- [ ] `bun dev` starts without errors
