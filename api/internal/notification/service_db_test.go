package notification

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
)

type stubLookup struct{ detail *metadata.AnimeDetail }

func (s stubLookup) GetAnimeDetail(context.Context, int, bool) (*metadata.AnimeDetail, error) {
	return s.detail, nil
}

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

// The stored row — what the in-app list and the WebSocket payload show —
// must already carry the anime name and episode, not the torrent name.
func TestSendEnrichesDownloadRowBeforeInsert(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()
	detail := &metadata.AnimeDetail{}
	detail.Title = "Bleach"
	detail.CoverImage = "https://img.example/bleach.jpg"
	svc := NewService(q, nil, stubLookup{detail: detail})

	dl, err := q.CreateDownload(ctx, store.CreateDownloadParams{
		ID: "dl-1", Gid: "gid-1", Url: "magnet:?xt=1", Name: "[Sub] Bleach - 05 [1080p].mkv", Status: "complete",
		BangumiID: sql.NullInt64{Int64: 530725, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}

	svc.Send(ctx, "download.completed", "Download Complete", dl.Name, "success", map[string]any{"download_id": dl.ID, "gid": dl.Gid})

	rows, err := q.ListNotifications(ctx, store.ListNotificationsParams{Limit: 10})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%d err=%v", len(rows), err)
	}
	if rows[0].Title != "Bleach EP5 downloaded" {
		t.Errorf("title = %q", rows[0].Title)
	}
	if rows[0].Message != dl.Name {
		t.Errorf("message = %q", rows[0].Message)
	}
	for _, want := range []string{`"bangumi_id":530725`, `"anime_name":"Bleach"`, `"episode":"05"`, `"subgroup":"Sub"`, `"cover_image":"https://img.example/bleach.jpg"`} {
		if !strings.Contains(rows[0].Metadata.String, want) {
			t.Errorf("metadata %s lacks %s", rows[0].Metadata.String, want)
		}
	}
}

func TestSendLeavesUnknownDownloadsAlone(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()
	svc := NewService(q, nil, stubLookup{detail: nil})
	svc.Send(ctx, "download.failed", "Download Failed", "raw name", "error", map[string]any{"download_id": "missing"})
	rows, err := q.ListNotifications(ctx, store.ListNotificationsParams{Limit: 10})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%d err=%v", len(rows), err)
	}
	if rows[0].Title != "Download Failed" || rows[0].Message != "raw name" {
		t.Errorf("row modified: %q / %q", rows[0].Title, rows[0].Message)
	}
}
