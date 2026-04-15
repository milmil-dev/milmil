package duplicates

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

func newTestQueries(t *testing.T) (*store.Queries, func()) {
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

func mustCreateLibrary(t *testing.T, q *store.Queries, id string) {
	t.Helper()
	_, err := q.CreateLibrary(context.Background(), store.CreateLibraryParams{
		ID:                  id,
		Name:                id,
		Path:                filepath.Join(t.TempDir(), id),
		Enabled:             1,
		ScanIntervalMinutes: 60,
		SourceType:          "local",
	})
	if err != nil {
		t.Fatalf("CreateLibrary: %v", err)
	}
}

func mustCreateAnime(t *testing.T, q *store.Queries, id, libraryID string, totalEpisodes int64) {
	t.Helper()
	total := sql.NullInt64{}
	if totalEpisodes > 0 {
		total = sql.NullInt64{Int64: totalEpisodes, Valid: true}
	}
	_, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
		ID:            id,
		LibraryID:     sql.NullString{String: libraryID, Valid: true},
		Title:         id,
		Status:        "unknown",
		Genres:        "[]",
		TotalEpisodes: total,
		WatchStatus:   "none",
		Score:         0,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
}

func mustCreateEpisode(t *testing.T, q *store.Queries, animeID, episodeID string, num float64) {
	t.Helper()
	_, err := q.CreateEpisode(context.Background(), store.CreateEpisodeParams{
		ID:            episodeID,
		AnimeID:       animeID,
		EpisodeNumber: num,
	})
	if err != nil {
		t.Fatalf("CreateEpisode: %v", err)
	}
}

// mustCreateMediaFile inserts a media file (path = filename) and links it to episodeID.
func mustCreateMediaFile(t *testing.T, q *store.Queries, id, libraryID, episodeID, filename string, size int64) {
	t.Helper()
	ctx := context.Background()
	_, err := q.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
		ID:        id,
		LibraryID: libraryID,
		Path:      filename,
		Filename:  filename,
		SizeBytes: size,
	})
	if err != nil {
		t.Fatalf("UpsertMediaFile: %v", err)
	}
	if err := q.LinkMediaFileToEpisode(ctx, store.LinkMediaFileToEpisodeParams{
		ID:        id,
		EpisodeID: sql.NullString{String: episodeID, Valid: true},
	}); err != nil {
		t.Fatalf("LinkMediaFileToEpisode: %v", err)
	}
}
