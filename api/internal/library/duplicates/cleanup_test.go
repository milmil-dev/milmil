package duplicates

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/milmil/api/internal/store"
)

type fakeStorage struct {
	deleted []string
	failOn  map[string]error
}

func (f *fakeStorage) Delete(path string) error {
	if err, ok := f.failOn[path]; ok {
		return err
	}
	f.deleted = append(f.deleted, path)
	return nil
}

func TestDeleteMediaFile_HappyPath(t *testing.T) {
	ctx := context.Background()
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 1)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)
	mustCreateMediaFile(t, q, "mf-1", "lib1", "a1-e1", "only.mkv", 100)

	fs := &fakeStorage{}
	if err := DeleteMediaFile(ctx, q, fs, "mf-1"); err != nil {
		t.Fatalf("DeleteMediaFile: %v", err)
	}
	if len(fs.deleted) != 1 || fs.deleted[0] != "only.mkv" {
		t.Fatalf("expected storage.Delete(only.mkv), got %v", fs.deleted)
	}
	if _, err := q.GetMediaFileByID(ctx, "mf-1"); err == nil {
		t.Fatalf("expected row to be gone, still present")
	}
}

func TestDeleteLibraryNonPreferred_PreservesPreferred(t *testing.T) {
	ctx := context.Background()
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 1)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)
	mustCreateMediaFile(t, q, "mf-keep", "lib1", "a1-e1", "keep.mkv", 1000)
	mustCreateMediaFile(t, q, "mf-drop1", "lib1", "a1-e1", "drop1.mkv", 300)
	mustCreateMediaFile(t, q, "mf-drop2", "lib1", "a1-e1", "drop2.mkv", 500)

	if err := q.SetEpisodePreferredManual(ctx, store.SetEpisodePreferredManualParams{
		ID:     "a1-e1",
		FileID: sql.NullString{String: "mf-keep", Valid: true},
	}); err != nil {
		t.Fatalf("SetEpisodePreferredManual: %v", err)
	}

	fs := &fakeStorage{}
	res, err := DeleteLibraryNonPreferred(ctx, q, fs, "lib1")
	if err != nil {
		t.Fatalf("DeleteLibraryNonPreferred: %v", err)
	}
	if res.Deleted != 2 {
		t.Fatalf("expected 2 deleted, got %d", res.Deleted)
	}
	if res.ReclaimedBytes != 800 {
		t.Fatalf("expected 800 reclaimed bytes, got %d", res.ReclaimedBytes)
	}
	if res.Skipped != 0 {
		t.Fatalf("expected 0 skipped, got %d", res.Skipped)
	}
	// Preferred still present.
	if _, err := q.GetMediaFileByID(ctx, "mf-keep"); err != nil {
		t.Fatalf("preferred file was deleted: %v", err)
	}
	// Non-preferred gone from DB.
	for _, id := range []string{"mf-drop1", "mf-drop2"} {
		if _, err := q.GetMediaFileByID(ctx, id); err == nil {
			t.Fatalf("%s still present, expected gone", id)
		}
	}
	// And from disk.
	if len(fs.deleted) != 2 {
		t.Fatalf("expected 2 disk deletes, got %v", fs.deleted)
	}
}

func TestDeleteLibraryNonPreferred_CollectsErrors(t *testing.T) {
	ctx := context.Background()
	q, cleanup := newTestQueries(t)
	defer cleanup()

	mustCreateLibrary(t, q, "lib1")
	mustCreateAnime(t, q, "a1", "lib1", 1)
	mustCreateEpisode(t, q, "a1", "a1-e1", 1)
	mustCreateMediaFile(t, q, "mf-keep", "lib1", "a1-e1", "keep.mkv", 1000)
	mustCreateMediaFile(t, q, "mf-drop1", "lib1", "a1-e1", "drop1.mkv", 300)
	mustCreateMediaFile(t, q, "mf-drop2", "lib1", "a1-e1", "drop2.mkv", 500)

	if err := q.SetEpisodePreferredManual(ctx, store.SetEpisodePreferredManualParams{
		ID:     "a1-e1",
		FileID: sql.NullString{String: "mf-keep", Valid: true},
	}); err != nil {
		t.Fatalf("SetEpisodePreferredManual: %v", err)
	}

	boom := errors.New("disk write protected")
	fs := &fakeStorage{failOn: map[string]error{"drop1.mkv": boom}}

	res, err := DeleteLibraryNonPreferred(ctx, q, fs, "lib1")
	if err != nil {
		t.Fatalf("DeleteLibraryNonPreferred: %v", err)
	}
	if res.Deleted != 1 {
		t.Fatalf("expected 1 deleted, got %d", res.Deleted)
	}
	if res.ReclaimedBytes != 500 {
		t.Fatalf("expected 500 reclaimed bytes, got %d", res.ReclaimedBytes)
	}
	if len(res.Errors) != 1 {
		t.Fatalf("expected 1 collected error, got %d (%v)", len(res.Errors), res.Errors)
	}
	// drop1 should remain because Delete failed.
	if _, err := q.GetMediaFileByID(ctx, "mf-drop1"); err != nil {
		t.Fatalf("expected mf-drop1 to remain after storage failure: %v", err)
	}
	if _, err := q.GetMediaFileByID(ctx, "mf-drop2"); err == nil {
		t.Fatalf("expected mf-drop2 gone")
	}
}
