package renamer

import (
	"context"
	"database/sql"
	"path/filepath"

	"uuid"

	"github.com/milmil/api/internal/store"
)

// Mover is the minimal storage surface Apply and UndoBatch need. storage.Provider
// satisfies an adapter around this (its Stat returns os.FileInfo which is
// assignable to `any`).
type Mover interface {
	Stat(path string) (any, error)
	MkdirAll(path string) error
	Rename(oldPath, newPath string) error
}

// BatchResult summarises one Apply invocation.
type BatchResult struct {
	BatchID string   `json:"batch_id"`
	Applied int      `json:"applied"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors"`
}

// Apply performs the rename for each PlanResult with Status == ok, recording a
// rename_history row and updating media_files.path for each success. Failures
// to rename are accumulated in Errors; failures to write history/update path
// are tolerated (logged via the error channel but don't roll the rename back).
func Apply(ctx context.Context, q *store.Queries, mover Mover, libraryID string, plans []PlanResult) (BatchResult, error) {
	batchID := uuid.New().String()
	res := BatchResult{BatchID: batchID}
	for _, p := range plans {
		if p.Status != StatusOK {
			res.Skipped++
			continue
		}
		if err := mover.MkdirAll(filepath.Dir(p.NewPath)); err != nil {
			res.Errors = append(res.Errors, "mkdir "+p.NewPath+": "+err.Error())
			continue
		}
		if err := mover.Rename(p.OldPath, p.NewPath); err != nil {
			res.Errors = append(res.Errors, "rename "+p.OldPath+": "+err.Error())
			continue
		}
		_ = q.InsertRenameHistory(ctx, store.InsertRenameHistoryParams{
			ID:          uuid.New().String(),
			BatchID:     batchID,
			LibraryID:   libraryID,
			MediaFileID: sql.NullString{String: p.MediaFileID, Valid: p.MediaFileID != ""},
			OldPath:     p.OldPath,
			NewPath:     p.NewPath,
		})
		if p.MediaFileID != "" {
			_ = q.UpdateMediaFilePath(ctx, store.UpdateMediaFilePathParams{
				Path:     p.NewPath,
				Filename: filepath.Base(p.NewPath),
				ID:       p.MediaFileID,
			})
		}
		res.Applied++
	}
	return res, nil
}
