package scanner

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

var videoExtensions = map[string]struct{}{
	".mkv": {}, ".mp4": {}, ".avi": {}, ".mov": {},
	".wmv": {}, ".m4v": {}, ".ts": {}, ".webm": {}, ".flv": {},
}

var subtitleExtensions = map[string]string{
	".srt": "srt",
	".ass": "ass",
	".ssa": "ass",
	".vtt": "vtt",
}

// languageSuffixes maps common filename language tags to BCP-47 codes.
var languageSuffixes = map[string]string{
	"chs": "zh-Hans",
	"cht": "zh-Hant",
	"sc":  "zh-Hans",
	"tc":  "zh-Hant",
	"zh":  "zh",
	"en":  "en",
	"ja":  "ja",
	"jp":  "ja",
	"ko":  "ko",
}

type Scanner struct {
	queries         *store.Queries
	providerFactory func(sourceType, configJSON string) (storage.Provider, error)
}

func New(queries *store.Queries) *Scanner {
	return &Scanner{
		queries:         queries,
		providerFactory: storage.NewProvider,
	}
}

func (s *Scanner) ScanLibrary(ctx context.Context, library store.Library, configJSON string) error {
	provider, err := s.providerFactory(library.SourceType, configJSON)
	if err != nil {
		return err
	}
	defer provider.Close()

	summary, err := s.queries.CreateScanSummary(ctx, store.CreateScanSummaryParams{
		ID:        uuid.NewString(),
		LibraryID: library.ID,
	})
	if err != nil {
		return err
	}

	// scannedPaths maps video file path → media file ID
	scannedPaths := make(map[string]string)
	var filesFound int64

	walkErr := provider.Walk(library.Path, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		ext := strings.ToLower(filepath.Ext(path))
		if _, ok := videoExtensions[ext]; !ok {
			return nil
		}
		upsertedFile, upsertErr := s.queries.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
			ID:        uuid.NewString(),
			LibraryID: library.ID,
			Path:      path,
			Filename:  info.Name(),
			SizeBytes: info.Size(),
		})
		if upsertErr != nil {
			return upsertErr
		}
		scannedPaths[path] = upsertedFile.ID
		filesFound++

		// Compute file hash if not already set
		if !upsertedFile.FileHash.Valid || upsertedFile.FileHash.String == "" {
			if r, openErr := provider.Open(path); openErr == nil {
				if hash, hashErr := ComputeFileHashFromReader(r); hashErr == nil {
					_ = s.queries.UpdateMediaFileHash(ctx, store.UpdateMediaFileHashParams{
						FileHash: sql.NullString{String: hash, Valid: true},
						ID:       upsertedFile.ID,
					})
				}
				r.Close()
			}
		}

		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	// Scan for external subtitle files matching each video
	if err := s.scanSubtitles(ctx, scannedPaths); err != nil {
		return err
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

// scanSubtitles discovers external subtitle files that match scanned video files.
// scannedPaths maps video file path → media file ID.
func (s *Scanner) scanSubtitles(ctx context.Context, scannedPaths map[string]string) error {
	for videoPath, mediaFileID := range scannedPaths {
		dir := filepath.Dir(videoPath)
		videoBase := strings.TrimSuffix(filepath.Base(videoPath), filepath.Ext(videoPath))

		// Build a set of already-known subtitle paths for this media file
		existingPaths, err := s.queries.ListSubtitlePathsByMediaFile(ctx, mediaFileID)
		if err != nil {
			return err
		}
		known := make(map[string]struct{}, len(existingPaths))
		for _, p := range existingPaths {
			known[p] = struct{}{}
		}

		// Look for subtitle files in the same directory
		for ext, format := range subtitleExtensions {
			pattern := filepath.Join(dir, videoBase+"*"+ext)
			matches, globErr := filepath.Glob(pattern)
			if globErr != nil {
				continue
			}
			for _, subPath := range matches {
				// Verify the match starts with the video base name
				subBase := filepath.Base(subPath)
				if !strings.HasPrefix(subBase, videoBase) {
					continue
				}

				if _, exists := known[subPath]; exists {
					continue
				}

				lang := detectLanguage(subBase, videoBase)
				_, createErr := s.queries.CreateSubtitleFile(ctx, store.CreateSubtitleFileParams{
					ID:          uuid.NewString(),
					MediaFileID: mediaFileID,
					Path:        subPath,
					Language:    lang,
					Format:      format,
					Source:      "local",
				})
				if createErr != nil {
					// Skip duplicates or other errors silently
					continue
				}
			}
		}
	}
	return nil
}

// detectLanguage extracts the language tag from a subtitle filename.
// Given videoBase "episode01" and subBase "episode01.chs.srt", it returns "zh-Hans".
// Falls back to "unknown" if no known suffix is found.
func detectLanguage(subBase, videoBase string) string {
	// Remove the subtitle extension to get the middle part
	withoutExt := strings.TrimSuffix(subBase, filepath.Ext(subBase))
	// The suffix is everything after the video base name
	suffix := strings.TrimPrefix(withoutExt, videoBase)
	suffix = strings.TrimLeft(suffix, ".")

	if suffix == "" {
		return "unknown"
	}

	// Check each dot-separated part against known language suffixes
	parts := strings.Split(suffix, ".")
	for _, part := range parts {
		lower := strings.ToLower(part)
		if lang, ok := languageSuffixes[lower]; ok {
			return lang
		}
	}
	return "unknown"
}
