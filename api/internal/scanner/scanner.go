package scanner

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

// ProgressFunc is called during scan/match with progress events.
type ProgressFunc func(event ProgressEvent)

// ProgressEvent describes a scan or match progress update.
type ProgressEvent struct {
	Type         string `json:"type"`
	LibraryID    string `json:"library_id"`
	LibraryName  string `json:"library_name,omitempty"`
	FilesFound   int    `json:"files_found,omitempty"`
	FilesHashed  int    `json:"files_hashed,omitempty"`
	FilesMatched int    `json:"files_matched,omitempty"`
	FilesTotal   int    `json:"files_total,omitempty"`
	CurrentFile  string `json:"current_file,omitempty"`
	Error        string `json:"error,omitempty"`
}

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

func (s *Scanner) ScanLibrary(ctx context.Context, library store.Library, configJSON string, onProgress ...ProgressFunc) error {
	var progress ProgressFunc
	if len(onProgress) > 0 && onProgress[0] != nil {
		progress = onProgress[0]
	}
	emit := func(e ProgressEvent) {
		if progress != nil {
			progress(e)
		}
	}

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

	// completeScan ensures the scan summary is always marked as completed,
	// even when an error occurs partway through.
	completeScan := func(found int64) {
		_ = s.queries.CompleteScanSummary(ctx, store.CompleteScanSummaryParams{
			ID:             summary.ID,
			FilesFound:     found,
			FilesUnmatched: found,
		})
	}

	// scannedPaths maps video file path → media file ID
	scannedPaths := make(map[string]string)
	var filesFound int64
	var filesHashed int
	var lastEmit time.Time

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

		// Emit scan progress every 5 files or every second
		if int(filesFound)%5 == 0 || time.Since(lastEmit) > time.Second {
			emit(ProgressEvent{Type: "scan:progress", LibraryID: library.ID, FilesFound: int(filesFound), CurrentFile: info.Name()})
			lastEmit = time.Now()
		}

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
			filesHashed++
			emit(ProgressEvent{Type: "scan:hash", LibraryID: library.ID, FilesHashed: filesHashed, FilesTotal: int(filesFound), CurrentFile: info.Name()})
		}

		return nil
	})
	if walkErr != nil {
		completeScan(filesFound)
		return walkErr
	}

	// Scan for external subtitle files matching each video
	if err := s.scanSubtitles(ctx, scannedPaths); err != nil {
		completeScan(filesFound)
		return err
	}

	// Extract embedded subtitles from video containers
	s.extractEmbeddedSubtitles(ctx, scannedPaths)

	// Remove media files that no longer exist on disk
	existingPaths, err := s.queries.ListMediaFilePathsByLibrary(ctx, library.ID)
	if err != nil {
		completeScan(filesFound)
		return err
	}
	for _, p := range existingPaths {
		if _, found := scannedPaths[p]; !found {
			_ = s.queries.DeleteMediaFile(ctx, p)
		}
	}

	// Record scan completion
	completeScan(filesFound)

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

// extractEmbeddedSubtitles probes video files for embedded subtitle streams
// and extracts them to external files so the player can load them.
func (s *Scanner) extractEmbeddedSubtitles(ctx context.Context, scannedPaths map[string]string) {
	// Codec → file extension mapping
	codecExt := map[string]string{
		"ass": ".ass", "ssa": ".ssa", "subrip": ".srt", "srt": ".srt",
		"webvtt": ".vtt", "mov_text": ".srt",
	}

	for videoPath, mediaFileID := range scannedPaths {
		// Check if we already have embedded subtitles for this file
		existing, _ := s.queries.ListSubtitlePathsByMediaFile(ctx, mediaFileID)
		hasEmbedded := false
		for _, p := range existing {
			if strings.Contains(p, ".embedded.") {
				hasEmbedded = true
				break
			}
		}
		if hasEmbedded {
			continue
		}

		// Probe for embedded subtitle streams
		subs, err := ffmpeg.ProbeSubtitles(ctx, videoPath)
		if err != nil || len(subs) == 0 {
			continue
		}

		dir := filepath.Dir(videoPath)
		videoBase := strings.TrimSuffix(filepath.Base(videoPath), filepath.Ext(videoPath))

		for i, sub := range subs {
			ext, ok := codecExt[sub.Codec]
			if !ok {
				ext = ".srt" // fallback
			}

			lang := sub.Language
			if lang == "" {
				lang = "und"
			}

			// Build output path: video.embedded.0.eng.ass
			outName := fmt.Sprintf("%s.embedded.%d.%s%s", videoBase, i, lang, ext)
			outPath := filepath.Join(dir, outName)

			if err := ffmpeg.ExtractSubtitle(ctx, videoPath, sub.Index, outPath); err != nil {
				slog.Warn("scanner: failed to extract subtitle",
					"file", videoPath, "stream", sub.Index, "err", err)
				continue
			}

			// Determine display label
			label := lang
			if sub.Title != "" {
				label = sub.Title
			}

			format := strings.TrimPrefix(ext, ".")
			_, _ = s.queries.CreateSubtitleFile(ctx, store.CreateSubtitleFileParams{
				ID:          uuid.NewString(),
				MediaFileID: mediaFileID,
				Path:        outPath,
				Language:    label,
				Format:      format,
				Source:      "embedded",
			})
		}
	}
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
