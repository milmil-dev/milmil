package duplicates

import (
	"context"

	"github.com/milmil/api/internal/store"
)

// Deleter is the minimum surface Cleanup needs from a storage provider. Kept
// as a tiny interface so tests can fake it without importing the storage
// package.
type Deleter interface {
	Delete(path string) error
}

// CleanupResult summarises a DeleteLibraryNonPreferred run.
type CleanupResult struct {
	Deleted        int     `json:"deleted"`
	ReclaimedBytes int64   `json:"reclaimed_bytes"`
	Skipped        int     `json:"skipped"`
	Errors         []error `json:"-"`
}

// DeleteMediaFile hard-deletes a single media file from disk and DB.
func DeleteMediaFile(ctx context.Context, q *store.Queries, del Deleter, id string) error {
	mf, err := q.GetMediaFileByID(ctx, id)
	if err != nil {
		return err
	}
	if err := del.Delete(mf.Path); err != nil {
		return err
	}
	return q.DeleteMediaFileByID(ctx, id)
}

// DeleteLibraryNonPreferred iterates duplicate episodes and deletes every
// file that isn't the preferred one. Episodes without a preferred file are
// skipped (ambiguous ranking — nothing to keep).
func DeleteLibraryNonPreferred(ctx context.Context, q *store.Queries, del Deleter, libraryID string) (CleanupResult, error) {
	sets, err := FindLibraryDuplicates(ctx, q, libraryID)
	if err != nil {
		return CleanupResult{}, err
	}
	res := CleanupResult{}
	for _, set := range sets {
		if set.PreferredID == "" {
			res.Skipped++
			continue
		}
		for _, f := range set.Files {
			if f.ID == set.PreferredID {
				continue
			}
			if err := DeleteMediaFile(ctx, q, del, f.ID); err != nil {
				res.Errors = append(res.Errors, err)
				continue
			}
			res.Deleted++
			res.ReclaimedBytes += f.SizeBytes
		}
	}
	return res, nil
}
