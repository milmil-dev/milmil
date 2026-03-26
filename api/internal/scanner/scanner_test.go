package scanner_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

func newTestDB(t *testing.T) (*store.Queries, func()) {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	q := store.New(database)
	return q, func() { database.Close() }
}

func makeLibrary(t *testing.T, q *store.Queries, path string) store.Library {
	t.Helper()
	lib, err := q.CreateLibrary(context.Background(), store.CreateLibraryParams{
		ID:                  "lib-1",
		Name:                "Test Library",
		Path:                path,
		Enabled:             1,
		ScanIntervalMinutes: 60,
	})
	if err != nil {
		t.Fatal(err)
	}
	return lib
}

func TestScanner_EmptyDir(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	dir := t.TempDir()
	lib := makeLibrary(t, q, dir)

	sc := scanner.New(q)
	if err := sc.ScanLibrary(context.Background(), lib); err != nil {
		t.Fatalf("ScanLibrary: %v", err)
	}

	count, err := q.CountMediaFilesByLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("want 0 media files, got %d", count)
	}
}

func TestScanner_VideoFiles(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	dir := t.TempDir()
	// Create a video file and a non-video file
	os.WriteFile(filepath.Join(dir, "episode01.mkv"), []byte("fake"), 0644)
	os.WriteFile(filepath.Join(dir, "subtitle.srt"), []byte("fake"), 0644)

	lib := makeLibrary(t, q, dir)
	sc := scanner.New(q)
	if err := sc.ScanLibrary(context.Background(), lib); err != nil {
		t.Fatalf("ScanLibrary: %v", err)
	}

	count, err := q.CountMediaFilesByLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("want 1 media file (only .mkv), got %d", count)
	}
}

func TestScanner_RemovesStaleFiles(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	dir := t.TempDir()
	videoPath := filepath.Join(dir, "ep01.mkv")
	os.WriteFile(videoPath, []byte("fake"), 0644)

	lib := makeLibrary(t, q, dir)
	sc := scanner.New(q)
	// First scan: inserts the file
	if err := sc.ScanLibrary(context.Background(), lib); err != nil {
		t.Fatal(err)
	}

	// Remove the file and scan again
	os.Remove(videoPath)
	if err := sc.ScanLibrary(context.Background(), lib); err != nil {
		t.Fatal(err)
	}

	count, err := q.CountMediaFilesByLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("want 0 media files after removal, got %d", count)
	}
}
