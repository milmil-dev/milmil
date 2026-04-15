package completeness

import (
	"context"
	"database/sql"
	"fmt"
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
	})
	if err != nil {
		t.Fatalf("CreateLibrary: %v", err)
	}
}

// mustInsertAnimeForLibrary inserts an anime; totalEpisodes==0 means NULL.
func mustInsertAnimeForLibrary(t *testing.T, q *store.Queries, animeID, libraryID string, totalEpisodes int64) {
	t.Helper()
	total := sql.NullInt64{}
	if totalEpisodes > 0 {
		total = sql.NullInt64{Int64: totalEpisodes, Valid: true}
	}
	_, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
		ID:            animeID,
		LibraryID:     sql.NullString{String: libraryID, Valid: true},
		Title:         animeID,
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

// mustInsertEpisode inserts one episode. airDate "" means NULL. Returns id.
func mustInsertEpisode(t *testing.T, q *store.Queries, animeID string, num float64, airDate string) string {
	t.Helper()
	id := fmt.Sprintf("%s-ep-%v", animeID, num)
	ad := sql.NullString{}
	if airDate != "" {
		ad = sql.NullString{String: airDate, Valid: true}
	}
	_, err := q.CreateEpisode(context.Background(), store.CreateEpisodeParams{
		ID:            id,
		AnimeID:       animeID,
		EpisodeNumber: num,
		AirDate:       ad,
	})
	if err != nil {
		t.Fatalf("CreateEpisode: %v", err)
	}
	return id
}

// mustLinkMediaFile inserts a media file and links it to the given episode.
func mustLinkMediaFile(t *testing.T, q *store.Queries, episodeID, libraryID string) {
	t.Helper()
	ctx := context.Background()
	mfID := "mf-" + episodeID
	path := filepath.Join(t.TempDir(), mfID+".mkv")
	_, err := q.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
		ID:        mfID,
		LibraryID: libraryID,
		Path:      path,
		Filename:  mfID + ".mkv",
		SizeBytes: 1000,
	})
	if err != nil {
		t.Fatalf("UpsertMediaFile: %v", err)
	}
	if err := q.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
		EpisodeID: sql.NullString{String: episodeID, Valid: true},
		ID:        mfID,
	}); err != nil {
		t.Fatalf("UpdateMediaFileEpisodeID: %v", err)
	}
}
