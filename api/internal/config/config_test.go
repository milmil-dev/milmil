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
	os.Unsetenv("REDIS_FAIL_FAST")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.Empty(t, cfg.RedisURL) // Redis is optional
	require.False(t, cfg.RedisFailFast)
}

func TestLoad_RedisFailFast(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite://data/test.db")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("REDIS_FAIL_FAST", "true")
	os.Unsetenv("DEBUG")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.True(t, cfg.RedisFailFast)
	require.False(t, cfg.Debug)
}

func TestLoad_DebugEnabled(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite://data/test.db")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("DEBUG", "1")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.True(t, cfg.Debug)
}

func TestLoad_TMDBCredentials(t *testing.T) {
	t.Setenv("DATABASE_URL", "sqlite://data/test.db")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("TMDB_API_KEY", "tmdb-api-key")
	t.Setenv("TMDB_ACCESS_TOKEN", "tmdb-access-token")

	cfg, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, "tmdb-api-key", cfg.TMDBAPIKey)
	require.Equal(t, "tmdb-access-token", cfg.TMDBAccessToken)
}
