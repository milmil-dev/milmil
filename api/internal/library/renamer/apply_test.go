package renamer

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// fsMover is a Mover backed by the real filesystem, used by Apply/Undo tests.
type fsMover struct{}

func (fsMover) Stat(path string) (any, error) { return os.Stat(path) }
func (fsMover) MkdirAll(path string) error    { return os.MkdirAll(path, 0o755) }
func (fsMover) Rename(old, new string) error  { return os.Rename(old, new) }

func TestApply_MovesFileAndRecordsHistory(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	root := t.TempDir()
	libID := "lib1"
	mustCreateLibrary(t, q, libID, root)
	mustCreateAnime(t, q, "anime1", libID, 12, "Frieren")
	mustCreateEpisode(t, q, "anime1", "ep1", 1, "Journey's End")

	// Make the source file on disk.
	srcDir := filepath.Join(root, "raw")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(srcDir, "[Group] Frieren - 01 [1080p].mkv")
	if err := os.WriteFile(src, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustCreateMediaFile(t, q, "mf1", libID, "ep1", src, 4)

	dst := filepath.Join(root, "Frieren", "S01E01.mkv")
	plans := []PlanResult{{
		MediaFileID: "mf1",
		OldPath:     src,
		NewPath:     dst,
		Status:      StatusOK,
	}}

	res, err := Apply(context.Background(), q, fsMover{}, libID, plans)
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 1 {
		t.Errorf("Applied = %d, want 1", res.Applied)
	}
	if res.BatchID == "" {
		t.Errorf("BatchID empty")
	}
	if len(res.Errors) != 0 {
		t.Errorf("Errors: %v", res.Errors)
	}

	// File moved.
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Errorf("src still exists: %v", err)
	}
	if _, err := os.Stat(dst); err != nil {
		t.Errorf("dst missing: %v", err)
	}

	// DB updated.
	mf, err := q.GetMediaFileByID(context.Background(), "mf1")
	if err != nil {
		t.Fatal(err)
	}
	if mf.Path != dst {
		t.Errorf("media_files.path = %q, want %q", mf.Path, dst)
	}
	if mf.Filename != "S01E01.mkv" {
		t.Errorf("filename = %q", mf.Filename)
	}

	// History row present.
	rows, err := q.ListRenameHistoryByBatch(context.Background(), res.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("history rows = %d, want 1", len(rows))
	}
	if rows[0].OldPath != src || rows[0].NewPath != dst {
		t.Errorf("history row: old=%q new=%q", rows[0].OldPath, rows[0].NewPath)
	}
	if !rows[0].MediaFileID.Valid || rows[0].MediaFileID.String != "mf1" {
		t.Errorf("history MediaFileID = %+v", rows[0].MediaFileID)
	}
}

func TestApply_SkipsNonOKPlans(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	root := t.TempDir()
	libID := "lib1"
	mustCreateLibrary(t, q, libID, root)

	plans := []PlanResult{
		{MediaFileID: "a", Status: StatusSkipSameAsCurrent},
		{MediaFileID: "b", Status: StatusSkipCollision},
		{MediaFileID: "c", Status: StatusError, Error: "bad"},
	}
	res, err := Apply(context.Background(), q, fsMover{}, libID, plans)
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 0 {
		t.Errorf("Applied = %d, want 0", res.Applied)
	}
	if res.Skipped != 3 {
		t.Errorf("Skipped = %d, want 3", res.Skipped)
	}
	rows, err := q.ListRenameHistoryByBatch(context.Background(), res.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Errorf("expected no history rows, got %d", len(rows))
	}
}
