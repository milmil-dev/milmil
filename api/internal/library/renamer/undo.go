package renamer

import (
	"context"
	"path/filepath"

	"github.com/milmil/api/internal/store"
)

// UndoResult summarises an UndoBatch invocation.
type UndoResult struct {
	Reverted int      `json:"reverted"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

// UndoBatch reverses a batch recorded by Apply: for each un-reverted history
// row it renames NewPath back to OldPath, updates media_files.path, and marks
// the history row reverted. Rows already marked reverted are ignored; rows
// whose NewPath no longer exists on disk are skipped with a recorded error.
func UndoBatch(ctx context.Context, q *store.Queries, mover Mover, batchID string) (UndoResult, error) {
	rows, err := q.ListRenameHistoryByBatch(ctx, batchID)
	if err != nil {
		return UndoResult{}, err
	}
	res := UndoResult{}
	for _, row := range rows {
		if row.RevertedAt.Valid {
			continue
		}
		if _, err := mover.Stat(row.NewPath); err != nil {
			res.Skipped++
			res.Errors = append(res.Errors, "missing at "+row.NewPath)
			continue
		}
		if err := mover.MkdirAll(filepath.Dir(row.OldPath)); err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		if err := mover.Rename(row.NewPath, row.OldPath); err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		if row.MediaFileID.Valid {
			_ = q.UpdateMediaFilePath(ctx, store.UpdateMediaFilePathParams{
				Path:     row.OldPath,
				Filename: filepath.Base(row.OldPath),
				ID:       row.MediaFileID.String,
			})
		}
		_ = q.MarkRenameHistoryReverted(ctx, row.ID)
		res.Reverted++
	}
	return res, nil
}
