package config

import (
	"fmt"
	"strings"

	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/v2"
	"github.com/milmil/api/internal/crypto"
)

type Config struct {
	DatabaseURL         string
	RedisURL            string // optional
	RedisFailFast       bool   // if true, fail startup when Redis is configured but unavailable
	Debug               bool   // enables debug logs when true (set DEBUG=1)
	JWTSecret           string
	EncryptionKey       []byte // 32-byte AES-256 key for encrypting storage credentials
	APIPort             int
	DataDir             string
	TorrentListenPort   int
	SeedRatio           float64
	SeedTimeMinutes     int
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

	// Defaults via confmap provider.
	defaults := map[string]any{
		"API_PORT":         8080,
		"DATA_DIR":         "./data",
		"DATABASE_URL":     "sqlite://data/milmil.db",
		"TORRENT_LISTEN_PORT": 42069,
		"SEED_RATIO":         1.0,
		"SEED_TIME_MINUTES":  60,
		"REDIS_URL":          "",
		"REDIS_FAIL_FAST":  false,
		"DEBUG":            false,
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
		RedisFailFast:       k.Bool("REDIS_FAIL_FAST"),
		Debug:               k.Bool("DEBUG"),
		JWTSecret:           k.String("JWT_SECRET"),
		APIPort:             k.Int("API_PORT"),
		DataDir:             k.String("DATA_DIR"),
		TorrentListenPort:   k.Int("TORRENT_LISTEN_PORT"),
		SeedRatio:           k.Float64("SEED_RATIO"),
		SeedTimeMinutes:     k.Int("SEED_TIME_MINUTES"),
		DandanPlayAppID:     k.String("DANDANPLAY_APP_ID"),
		DandanPlayAppSecret: k.String("DANDANPLAY_APP_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	// Derive encryption key from MILMIL_ENCRYPTION_KEY or fall back to JWT_SECRET.
	encSecret := k.String("MILMIL_ENCRYPTION_KEY")
	if encSecret == "" {
		encSecret = cfg.JWTSecret
	}
	cfg.EncryptionKey = crypto.DeriveKey(encSecret)

	return cfg, nil
}
