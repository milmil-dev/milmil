//go:build integration

package db_test

import (
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/migrations"
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
	// Use a temp file — golang-migrate's sqlite driver doesn't support named in-memory URIs.
	dsn := "sqlite://" + filepath.Join(t.TempDir(), "test.db")
	err := db.MigrateUp(migrations.FS, dsn)
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
