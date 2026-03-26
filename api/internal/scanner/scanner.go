package scanner

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/store"
)

var videoExtensions = map[string]struct{}{
	".mkv": {}, ".mp4": {}, ".avi": {}, ".mov": {},
	".wmv": {}, ".m4v": {}, ".ts": {}, ".webm": {}, ".flv": {},
}

type Scanner struct {
	queries *store.Queries
}

func New(queries *store.Queries) *Scanner {
	return &Scanner{queries: queries}
}

func (s *Scanner) ScanLibrary(ctx context.Context, library store.Library) error {
	summary, err := s.queries.CreateScanSummary(ctx, store.CreateScanSummaryParams{
		ID:        uuid.NewString(),
		LibraryID: library.ID,
	})
	if err != nil {
		return err
	}

	scannedPaths := make(map[string]struct{})
	var filesFound int64

	walkErr := filepath.Walk(library.Path, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		ext := strings.ToLower(filepath.Ext(path))
		if _, ok := videoExtensions[ext]; !ok {
			return nil
		}
		_, upsertErr := s.queries.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
			ID:        uuid.NewString(),
			LibraryID: library.ID,
			Path:      path,
			Filename:  info.Name(),
			SizeBytes: info.Size(),
		})
		if upsertErr != nil {
			return upsertErr
		}
		scannedPaths[path] = struct{}{}
		filesFound++
		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	// Remove media files that no longer exist on disk
	existingPaths, err := s.queries.ListMediaFilePathsByLibrary(ctx, library.ID)
	if err != nil {
		return err
	}
	for _, p := range existingPaths {
		if _, found := scannedPaths[p]; !found {
			_ = s.queries.DeleteMediaFile(ctx, p)
		}
	}

	// Record scan completion
	_ = s.queries.CompleteScanSummary(ctx, store.CompleteScanSummaryParams{
		ID:             summary.ID,
		FilesFound:     filesFound,
		FilesUnmatched: filesFound, // All files start as unmatched (no episode link yet)
	})

	// Update library last_scanned_at
	_ = s.queries.UpdateLibraryLastScanned(ctx, library.ID)

	return nil
}
