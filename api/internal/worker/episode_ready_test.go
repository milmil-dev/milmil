package worker

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
)

func newTestQueries(t *testing.T) *store.Queries {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	return store.New(database)
}

// A finished download for a known series whose file the pipeline linked to
// its episode yields one anime.episode_ready with a deep-linkable payload;
// the same download before linking yields nothing.
func TestNotifyEpisodeReady(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()
	w := &DownloadSyncWorker{queries: q, notifier: notification.NewService(q, nil)}

	lib, err := q.CreateLibrary(ctx, store.CreateLibraryParams{ID: "lib-1", Name: "Anime", Path: t.TempDir(), Enabled: 1, SourceType: "local"})
	if err != nil {
		t.Fatal(err)
	}
	anime, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID: "anime-1", LibraryID: sql.NullString{String: lib.ID, Valid: true}, Title: "Bleach", WatchStatus: "none",
		TitleZh: sql.NullString{String: "死神", Valid: true}, BangumiID: sql.NullInt64{Int64: 530725, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	episode, err := q.CreateEpisode(ctx, store.CreateEpisodeParams{
		ID: "ep-5", AnimeID: anime.ID, EpisodeNumber: 5, TitleZh: sql.NullString{String: "雷神", Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	dl := store.Download{ID: "dl-1", Name: "[Sub] Bleach - 05 [1080p].mkv", BangumiID: sql.NullInt64{Int64: 530725, Valid: true}}

	w.notifyEpisodeReady(ctx, dl)
	if rows, _ := q.ListNotifications(ctx, store.ListNotificationsParams{Limit: 10}); len(rows) != 0 {
		t.Fatalf("notified before any file was linked: %+v", rows)
	}

	file, err := q.UpsertMediaFile(ctx, store.UpsertMediaFileParams{ID: "mf-1", LibraryID: lib.ID, Path: "/a/ep05.mkv", Filename: "ep05.mkv", SizeBytes: 1})
	if err != nil {
		t.Fatal(err)
	}
	if err := q.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{EpisodeID: sql.NullString{String: episode.ID, Valid: true}, ID: file.ID}); err != nil {
		t.Fatal(err)
	}

	w.notifyEpisodeReady(ctx, dl)
	rows, err := q.ListNotifications(ctx, store.ListNotificationsParams{Limit: 10})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%d err=%v", len(rows), err)
	}
	row := rows[0]
	if row.Type != "anime.episode_ready" || row.Title != "死神 EP5 is ready to watch" || row.Message != "雷神" {
		t.Errorf("row = %q / %q / %q", row.Type, row.Title, row.Message)
	}
	for _, want := range []string{`"bangumi_id":530725`, `"episode":"5"`, `"episode_id":"ep-5"`, `"media_file_id":"mf-1"`, `"anime_name":"死神"`} {
		if !strings.Contains(row.Metadata.String, want) {
			t.Errorf("metadata %s lacks %s", row.Metadata.String, want)
		}
	}
}

func TestNotifyEpisodeReadySkipsUnparseableDownloads(t *testing.T) {
	q := newTestQueries(t)
	w := &DownloadSyncWorker{queries: q, notifier: notification.NewService(q, nil)}
	w.notifyEpisodeReady(context.Background(), store.Download{ID: "dl-2", Name: "Bleach Movie", BangumiID: sql.NullInt64{Int64: 1, Valid: true}})
	w.notifyEpisodeReady(context.Background(), store.Download{ID: "dl-3", Name: "[Sub] X - 01.mkv"})
	if rows, _ := q.ListNotifications(context.Background(), store.ListNotificationsParams{Limit: 10}); len(rows) != 0 {
		t.Fatalf("unexpected notifications: %+v", rows)
	}
}
