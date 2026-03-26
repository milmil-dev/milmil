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

	// Defaults via confmap provider.
	defaults := map[string]any{
		"API_PORT":         8080,
		"DATA_DIR":         "./data",
		"DATABASE_URL":     "sqlite://data/milmil.db",
		"ARIA2_RPC_URL":    "http://localhost:6800/jsonrpc",
		"ARIA2_RPC_SECRET": "",
		"REDIS_URL":        "",
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
