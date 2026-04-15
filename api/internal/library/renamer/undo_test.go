package renamer

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestUndoBatch_RestoresPathAndMarksReverted(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	root := t.TempDir()
	libID := "lib1"
	mustCreateLibrary(t, q, libID, root)
	mustCreateAnime(t, q, "anime1", libID, 12, "Frieren")
	mustCreateEpisode(t, q, "anime1", "ep1", 1, "")

	// Seed: raw source becomes renamed dest via Apply.
	src := filepath.Join(root, "src", "raw.mkv")
	if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustCreateMediaFile(t, q, "mf1", libID, "ep1", src, 1)

	dst := filepath.Join(root, "Frieren", "S01E01.mkv")
	applyRes, err := Apply(context.Background(), q, fsMover{}, libID, []PlanResult{{
		MediaFileID: "mf1", OldPath: src, NewPath: dst, Status: StatusOK,
	}})
	if err != nil || applyRes.Applied != 1 {
		t.Fatalf("Apply failed: %v applied=%d", err, applyRes.Applied)
	}

	// Now undo.
	undoRes, err := UndoBatch(context.Background(), q, fsMover{}, applyRes.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if undoRes.Reverted != 1 {
		t.Errorf("Reverted = %d, want 1; errors=%v", undoRes.Reverted, undoRes.Errors)
	}

	// File moved back.
	if _, err := os.Stat(src); err != nil {
		t.Errorf("src not restored: %v", err)
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Errorf("dst still exists: %v", err)
	}

	// DB updated.
	mf, err := q.GetMediaFileByID(context.Background(), "mf1")
	if err != nil {
		t.Fatal(err)
	}
	if mf.Path != src {
		t.Errorf("path = %q, want %q", mf.Path, src)
	}

	// History marked reverted.
	rows, _ := q.ListRenameHistoryByBatch(context.Background(), applyRes.BatchID)
	if len(rows) != 1 || !rows[0].RevertedAt.Valid {
		t.Errorf("history not marked reverted: %+v", rows)
	}

	// Idempotency: second call should be a no-op.
	undoRes2, err := UndoBatch(context.Background(), q, fsMover{}, applyRes.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if undoRes2.Reverted != 0 {
		t.Errorf("second undo Reverted = %d, want 0", undoRes2.Reverted)
	}
}

func TestUndoBatch_SkipsMissingFile(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()

	root := t.TempDir()
	libID := "lib1"
	mustCreateLibrary(t, q, libID, root)
	mustCreateAnime(t, q, "anime1", libID, 12, "Frieren")
	mustCreateEpisode(t, q, "anime1", "ep1", 1, "")

	src := filepath.Join(root, "src", "raw.mkv")
	if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustCreateMediaFile(t, q, "mf1", libID, "ep1", src, 1)

	dst := filepath.Join(root, "Frieren", "S01E01.mkv")
	applyRes, err := Apply(context.Background(), q, fsMover{}, libID, []PlanResult{{
		MediaFileID: "mf1", OldPath: src, NewPath: dst, Status: StatusOK,
	}})
	if err != nil || applyRes.Applied != 1 {
		t.Fatalf("Apply failed: %v", err)
	}

	// Remove the renamed file out-of-band so Undo can't find it.
	if err := os.Remove(dst); err != nil {
		t.Fatal(err)
	}

	undoRes, err := UndoBatch(context.Background(), q, fsMover{}, applyRes.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if undoRes.Reverted != 0 {
		t.Errorf("Reverted = %d, want 0", undoRes.Reverted)
	}
	if undoRes.Skipped != 1 {
		t.Errorf("Skipped = %d, want 1", undoRes.Skipped)
	}
	if len(undoRes.Errors) == 0 {
		t.Errorf("expected an error message for missing file")
	}
}
