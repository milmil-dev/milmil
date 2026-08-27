package api

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
)

func newCapacityTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	return database
}

// Only downloads that completed into this library since the first of the
// month count; earlier, other-library and unfinished ones do not.
func TestDownloadedThisMonth(t *testing.T) {
	database := newCapacityTestDB(t)
	q := store.New(database)
	h := &handler{queries: q}
	ctx := context.Background()

	now := time.Now().UTC()
	thisMonth := time.Date(now.Year(), now.Month(), 1, 12, 0, 0, 0, time.UTC).Format("2006-01-02T15:04:05Z")
	lastMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1).Format("2006-01-02T15:04:05Z")

	insert := func(id, status, library, updatedAt string, bytes int64) {
		t.Helper()
		_, err := database.ExecContext(ctx, `INSERT INTO downloads (id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, library_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?)`, id, id, "magnet:?"+id, id, status, bytes, bytes, sql.NullString{String: library, Valid: library != ""}, updatedAt, updatedAt)
		if err != nil {
			t.Fatal(err)
		}
	}
	insert("a", "complete", "lib-1", thisMonth, 700)
	insert("b", "complete", "lib-1", thisMonth, 300)
	insert("c", "complete", "lib-1", lastMonth, 5000)
	insert("d", "complete", "lib-2", thisMonth, 9000)
	insert("e", "active", "lib-1", thisMonth, 9000)

	if got := h.downloadedThisMonth(ctx, "lib-1"); got != 1000 {
		t.Fatalf("downloadedThisMonth(lib-1) = %d, want 1000", got)
	}
	if got := h.downloadedThisMonth(ctx, "lib-none"); got != 0 {
		t.Fatalf("downloadedThisMonth(lib-none) = %d, want 0", got)
	}
}
