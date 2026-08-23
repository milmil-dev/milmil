package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	smb2 "github.com/hirochachacha/go-smb2"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/library/duplicates"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type createLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type updateLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	Enabled             bool                   `json:"enabled"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type testConnectionRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

type libraryConnectionStatusResponse struct {
	Online bool   `json:"online"`
	Error  string `json:"error,omitempty"`
}

type libraryListItem struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	Path                string  `json:"path"`
	Enabled             int64   `json:"enabled"`
	ScanIntervalMinutes int64   `json:"scan_interval_minutes"`
	LastScannedAt       *string `json:"last_scanned_at"`
	CreatedAt           string  `json:"created_at"`
	UpdatedAt           string  `json:"updated_at"`
	SourceType          string  `json:"source_type"`
	FileCount           int64   `json:"file_count"`
	MatchedCount        float64 `json:"matched_count"`
	UnmatchedCount      float64 `json:"unmatched_count"`
	TotalSizeBytes      int64   `json:"total_size_bytes"`
	RenameTemplate      string  `json:"rename_template"`
	RenameAuto          int64   `json:"rename_auto"`
}

func (h *handler) handleListLibraries(c *echo.Context) error {
	libs, err := h.queries.ListLibrariesWithStats(c.Request().Context())
	if err != nil {
		slog.Error("failed to list libraries", "err", err)
		return echo.ErrInternalServerError
	}
	result := make([]libraryListItem, len(libs))
	for i, lib := range libs {
		var totalSize int64
		if v, ok := lib.TotalSizeBytes.(int64); ok {
			totalSize = v
		} else if v, ok := lib.TotalSizeBytes.(float64); ok {
			totalSize = int64(v)
		}
		result[i] = libraryListItem{
			ID:                  lib.ID,
			Name:                lib.Name,
			Path:                lib.Path,
			Enabled:             lib.Enabled,
			ScanIntervalMinutes: lib.ScanIntervalMinutes,
			LastScannedAt:       nullStr(lib.LastScannedAt),
			CreatedAt:           lib.CreatedAt,
			UpdatedAt:           lib.UpdatedAt,
			SourceType:          lib.SourceType,
			FileCount:           lib.FileCount,
			MatchedCount:        lib.MatchedCount,
			UnmatchedCount:      lib.UnmatchedCount,
			TotalSizeBytes:      totalSize,
			RenameTemplate:      lib.RenameTemplate,
			RenameAuto:          lib.RenameAuto,
		}
	}
	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleGetLibrary(c *echo.Context) error {
	lib, err := h.queries.GetLibraryWithStats(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to get library", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}
	var totalSize int64
	if v, ok := lib.TotalSizeBytes.(int64); ok {
		totalSize = v
	} else if v, ok := lib.TotalSizeBytes.(float64); ok {
		totalSize = int64(v)
	}
	return c.JSON(http.StatusOK, libraryListItem{
		ID:                  lib.ID,
		Name:                lib.Name,
		Path:                lib.Path,
		Enabled:             lib.Enabled,
		ScanIntervalMinutes: lib.ScanIntervalMinutes,
		LastScannedAt:       nullStr(lib.LastScannedAt),
		CreatedAt:           lib.CreatedAt,
		UpdatedAt:           lib.UpdatedAt,
		SourceType:          lib.SourceType,
		FileCount:           lib.FileCount,
		MatchedCount:        lib.MatchedCount,
		UnmatchedCount:      lib.UnmatchedCount,
		TotalSizeBytes:      totalSize,
		RenameTemplate:      lib.RenameTemplate,
		RenameAuto:          lib.RenameAuto,
	})
}

func (h *handler) handleGetLibraryConnectionStatus(c *echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	online, errMsg := h.checkLibraryConnection(lib)
	return c.JSON(http.StatusOK, libraryConnectionStatusResponse{Online: online, Error: errMsg})
}

func (h *handler) checkLibraryConnection(lib store.Library) (bool, string) {
	if lib.SourceType == "local" || lib.SourceType == "" {
		p := storage.NewLocalProvider()
		if _, err := p.Stat(lib.Path); err != nil {
			return false, err.Error()
		}
		return true, ""
	}

	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return false, "cannot decrypt storage config"
		}
		configJSON = decrypted
	}

	provider, err := storage.NewProvider(lib.SourceType, configJSON)
	if err != nil {
		return false, err.Error()
	}
	defer provider.Close()

	if _, err := provider.Stat(lib.Path); err != nil {
		return false, err.Error()
	}

	return true, ""
}

func (h *handler) handleCreateLibrary(c *echo.Context) error {
	var req createLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	var encryptedConfig sql.NullString

	// Expand ~ to home directory
	if strings.HasPrefix(req.Path, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			if req.Path == "~" {
				req.Path = home
			} else {
				req.Path = filepath.Join(home, req.Path[2:]) // skip "~/"
			}
		}
	}

	if sourceType == "local" {
		// For local sources, validate the path exists on disk.
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
	} else {
		// For remote sources, encrypt the source config.
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			slog.Error("failed to encrypt source config", "err", err)
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}

	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.CreateLibrary(c.Request().Context(), store.CreateLibraryParams{
		ID:                    uuid.NewString(),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               1,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		slog.Error("failed to create library", "name", req.Name, "err", err)
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, lib)
}

func (h *handler) handleUpdateLibrary(c *echo.Context) error {
	var req updateLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	// Fetch existing library to preserve encrypted config when not provided.
	existing, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to get library for update", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}

	encryptedConfig := existing.SourceConfigEncrypted

	if sourceType == "local" {
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
		encryptedConfig = sql.NullString{}
	} else if len(req.SourceConfig) > 0 {
		// Only re-encrypt if new source_config was actually provided.
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			slog.Error("failed to encrypt source config on update", "err", err)
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}
	// else: keep existing.SourceConfigEncrypted (preserves credentials on edit)

	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.UpdateLibrary(c.Request().Context(), store.UpdateLibraryParams{
		ID:                    c.Param("id"),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               enabled,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to update library", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, lib)
}

func (h *handler) handleDeleteLibrary(c *echo.Context) error {
	if err := h.queries.DeleteLibrary(c.Request().Context(), c.Param("id")); err != nil {
		slog.Error("failed to delete library", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleDeleteAnime(c *echo.Context) error {
	animeID := c.Param("animeId")
	ctx := c.Request().Context()

	// Unlink media files first (set them back to unmatched)
	if err := h.queries.UnlinkMediaFilesByAnimeID(ctx, animeID); err != nil {
		slog.Error("delete anime: unlink media files", "anime_id", animeID, "err", err)
	}
	// Delete episodes
	if err := h.queries.DeleteEpisodesByAnimeID(ctx, animeID); err != nil {
		slog.Error("delete anime: delete episodes", "anime_id", animeID, "err", err)
	}
	// Delete anime
	if err := h.queries.DeleteAnime(ctx, animeID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleListLibraryAnime(c *echo.Context) error {
	libraryID := c.Param("id")
	animeList, err := h.queries.ListAnimeByLibrary(c.Request().Context(), sql.NullString{String: libraryID, Valid: true})
	if err != nil {
		return echo.ErrInternalServerError
	}

	type animeSummary struct {
		ID            string   `json:"id"`
		BangumiID     int64    `json:"bangumi_id"`
		AnilistID     int64    `json:"anilist_id,omitempty"`
		Title         string   `json:"title"`
		TitleOriginal string   `json:"title_original"`
		CoverImage    string   `json:"cover_image"`
		Genres        []string `json:"genres"`
		AirDate       string   `json:"air_date,omitempty"`
		EpisodeCount  int      `json:"episode_count"`
		Score         float64  `json:"score"`
	}

	result := make([]animeSummary, 0, len(animeList))
	for _, a := range animeList {
		var genres []string
		if a.Genres != "" {
			if err := json.Unmarshal([]byte(a.Genres), &genres); err != nil {
				slog.Debug("malformed genres column", "anime_id", a.ID, "err", err)
			}
		}
		if genres == nil {
			genres = []string{}
		}
		cover := ""
		if a.CoverImageUrl.Valid {
			cover = a.CoverImageUrl.String
		}
		titleOriginal := a.Title
		title := a.Title
		if a.TitleZh.Valid && a.TitleZh.String != "" {
			title = a.TitleZh.String
		}
		var bangumiID, anilistID int64
		if a.BangumiID.Valid {
			bangumiID = a.BangumiID.Int64
		}
		if a.AnilistID.Valid {
			anilistID = a.AnilistID.Int64
		}
		epCount := 0
		if a.TotalEpisodes.Valid {
			epCount = int(a.TotalEpisodes.Int64)
		}
		airDate := ""
		if a.AirDate.Valid {
			airDate = a.AirDate.String
		}
		result = append(result, animeSummary{
			ID:            a.ID,
			BangumiID:     bangumiID,
			AnilistID:     anilistID,
			Title:         title,
			TitleOriginal: titleOriginal,
			CoverImage:    cover,
			Genres:        genres,
			AirDate:       airDate,
			EpisodeCount:  epCount,
			Score:         a.Score,
		})
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleScanLibrary(c *echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to get library for scan", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}
	// Decrypt source config for network storage providers; local libraries use empty config.
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			slog.Error("failed to decrypt source config for scan", "library_id", lib.ID, "err", err)
			return echo.ErrInternalServerError
		}
		configJSON = decrypted
	}

	// Start scan in background goroutine — return 202 immediately.
	go func() {
		onProgress := func(event scanner.ProgressEvent) {
			event.LibraryName = lib.Name
			if h.wsHub != nil {
				h.wsHub.Broadcast(ws.Event{Type: event.Type, Data: event})
			}
		}

		onProgress(scanner.ProgressEvent{Type: "scan:started", LibraryID: lib.ID})

		sc := scanner.New(h.queries)
		if err := sc.ScanLibrary(context.Background(), lib, configJSON, onProgress); err != nil {
			onProgress(scanner.ProgressEvent{Type: "scan:error", LibraryID: lib.ID, Error: err.Error()})
			return
		}

		// Auto-match after scan (non-fatal if matcher is nil or fails)
		if h.matcher != nil {
			_, _ = h.matcher.MatchLibrary(context.Background(), lib.ID, onProgress)
		}
		// Resolve anime metadata after matching (non-fatal if resolver is nil or fails)
		if h.resolver != nil {
			_, _ = h.resolver.ResolveLibrary(context.Background(), lib.ID)
		}

		// Resolve Bangumi-matched files
		if h.resolver != nil {
			_, _ = h.resolver.ResolveBangumiMatched(context.Background(), lib.ID)
		}

		// Enrich episodes with TMDB Chinese metadata
		if tmdbClient := h.tmdbClient(); tmdbClient != nil {
			_, _ = matcher.EnrichEpisodesFromTMDB(context.Background(), h.queries, tmdbClient, h.cache, lib.ID)
		}

		// Rank duplicate episodes — picks preferred file for any episode with 2+ files.
		// Non-fatal; never fail the scan.
		if err := duplicates.AutoRank(context.Background(), h.queries, lib.ID); err != nil {
			slog.Warn("duplicates: autorank failed", "library", lib.ID, "err", err)
		}

		onProgress(scanner.ProgressEvent{Type: "scan:completed", LibraryID: lib.ID})
	}()

	return c.JSON(http.StatusAccepted, map[string]string{
		"status":     "scanning",
		"library_id": lib.ID,
	})
}

func (h *handler) handleMatchLibrary(c *echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	slog.Info("match: starting", "library_id", lib.ID, "library_name", lib.Name)

	go func() {
		onProgress := func(event scanner.ProgressEvent) {
			event.LibraryName = lib.Name
			if h.wsHub != nil {
				h.wsHub.Broadcast(ws.Event{Type: event.Type, Data: event})
			}
		}

		onProgress(scanner.ProgressEvent{Type: "match:started", LibraryID: lib.ID})

		if h.matcher != nil {
			summary, err := h.matcher.MatchLibrary(context.Background(), lib.ID, onProgress)
			if err != nil {
				slog.Error("match: MatchLibrary failed", "library_id", lib.ID, "err", err)
			} else {
				slog.Info("match: MatchLibrary done",
					"library_id", lib.ID,
					"matched", summary.Matched,
					"unmatched", summary.Unmatched,
					"errors", summary.Errors,
					"by_dandanplay", summary.ByDandanplay,
					"by_bangumi", summary.ByBangumi,
					"by_tmdb", summary.ByTMDB,
				)
			}
		}

		if h.resolver != nil {
			if rs, err := h.resolver.ResolveLibrary(context.Background(), lib.ID); err != nil {
				slog.Error("match: ResolveLibrary failed", "library_id", lib.ID, "err", err)
			} else {
				slog.Info("match: ResolveLibrary done", "library_id", lib.ID, "anime_created", rs.AnimeCreated, "episodes_created", rs.EpisodesCreated, "files_linked", rs.FilesLinked)
			}
			if rs, err := h.resolver.ResolveBangumiMatched(context.Background(), lib.ID); err != nil {
				slog.Error("match: ResolveBangumiMatched failed", "library_id", lib.ID, "err", err)
			} else {
				slog.Info("match: ResolveBangumiMatched done", "library_id", lib.ID, "anime_created", rs.AnimeCreated, "episodes_created", rs.EpisodesCreated, "files_linked", rs.FilesLinked)
			}
		}

		if tmdbClient := h.tmdbClient(); tmdbClient != nil {
			enriched, err := matcher.EnrichEpisodesFromTMDB(context.Background(), h.queries, tmdbClient, h.cache, lib.ID)
			if err != nil {
				slog.Error("match: TMDB enrichment failed", "library_id", lib.ID, "err", err)
			} else {
				slog.Info("match: TMDB enrichment done", "library_id", lib.ID, "episodes_enriched", enriched)
			}
		}

		// Rank duplicate episodes — non-fatal.
		if err := duplicates.AutoRank(context.Background(), h.queries, lib.ID); err != nil {
			slog.Warn("duplicates: autorank failed", "library", lib.ID, "err", err)
		}

		onProgress(scanner.ProgressEvent{Type: "match:completed", LibraryID: lib.ID})
		slog.Info("match: completed", "library_id", lib.ID)
	}()

	return c.JSON(http.StatusAccepted, map[string]string{
		"status":     "matching",
		"library_id": lib.ID,
	})
}

func sanitizeTimestamp(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	// Primary expected input format used by the database: RFC3339 UTC with Z suffix.
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC().Format(time.RFC3339), true
	}
	// Fallback for older or non-zoned values.
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC().Format(time.RFC3339), true
		}
	}
	return "", false
}

type scanSummaryResponse struct {
	ID             string  `json:"id"`
	LibraryID      string  `json:"library_id"`
	StartedAt      string  `json:"started_at"`
	CompletedAt    *string `json:"completed_at"`
	FilesFound     int64   `json:"files_found"`
	FilesMatched   int64   `json:"files_matched"`
	FilesUnmatched int64   `json:"files_unmatched"`
	Errors         string  `json:"errors"`
}

func (h *handler) handleListScanSummaries(c *echo.Context) error {
	summaries, err := h.queries.ListScanSummaries(c.Request().Context(), c.Param("id"))
	if err != nil {
		slog.Error("failed to list scan summaries", "library_id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}

	resp := make([]scanSummaryResponse, len(summaries))
	for i, s := range summaries {
		resp[i] = scanSummaryResponse{
			ID:             s.ID,
			LibraryID:      s.LibraryID,
			FilesFound:     s.FilesFound,
			FilesMatched:   s.FilesMatched,
			FilesUnmatched: s.FilesUnmatched,
			Errors:         s.Errors,
		}

		if normalized, ok := sanitizeTimestamp(s.StartedAt); ok {
			resp[i].StartedAt = normalized
		}

		if s.CompletedAt.Valid {
			if normalized, ok := sanitizeTimestamp(s.CompletedAt.String); ok {
				resp[i].CompletedAt = &normalized
			}
		}
	}

	return c.JSON(http.StatusOK, resp)
}

func (h *handler) handleTestConnection(c *echo.Context) error {
	var req testConnectionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	configJSON, _ := json.Marshal(req.SourceConfig)
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
	}
	defer provider.Close()

	if req.Path != "" {
		if _, statErr := provider.Stat(req.Path); statErr != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": statErr.Error()})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}

// ─── Browse directories ─────────────────────────────────────────────────────

type browseRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

type browseEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type browseResponse struct {
	Directories []browseEntry `json:"directories"`
}

func (h *handler) handleBrowse(c *echo.Context) error {
	var req browseRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	// Sanitize browse path to prevent directory traversal attacks.
	cleanPath := path.Clean("/" + req.Path)
	req.Path = cleanPath

	// For SMB: if share is empty, list available shares on the host instead of directories.
	if req.SourceType == "smb" {
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		var cfg storage.RcloneConfig
		if err := json.Unmarshal(configJSON, &cfg); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		if cfg.Share == "" {
			shares := listSMBSharesWithCredentials(
				c.Request().Context(),
				cfg.Host, cfg.Port,
				cfg.Username, cfg.Password, cfg.Domain,
			)
			dirs := make([]browseEntry, 0, len(shares))
			for _, s := range shares {
				dirs = append(dirs, browseEntry{Name: s, Path: s})
			}
			return c.JSON(http.StatusOK, browseResponse{Directories: dirs})
		}
	}

	configJSON, err := json.Marshal(req.SourceConfig)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
	}
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	defer provider.Close()

	browsePath := req.Path
	if browsePath == "" {
		browsePath = "/"
	}

	entries, err := provider.ReadDir(browsePath)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	dirs := make([]browseEntry, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			entryPath := path.Join(browsePath, entry.Name())
			dirs = append(dirs, browseEntry{
				Name: entry.Name(),
				Path: entryPath,
			})
		}
	}

	return c.JSON(http.StatusOK, browseResponse{Directories: dirs})
}

// listSMBSharesWithCredentials lists SMB shares on a host using provided credentials.
func listSMBSharesWithCredentials(ctx context.Context, host string, port int, username, password, domain string) []string {
	if host == "" {
		return nil
	}
	if port == 0 {
		port = 445
	}
	addr := fmt.Sprintf("%s:%d", host, port)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	d := net.Dialer{Timeout: 3 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil
	}

	initiator := &smb2.NTLMInitiator{
		User:     username,
		Password: password,
		Domain:   domain,
	}
	smbDialer := &smb2.Dialer{Initiator: initiator}

	s, err := smbDialer.DialContext(ctx, conn)
	if err != nil {
		conn.Close()
		return nil
	}

	names, err := s.ListSharenames()
	_ = s.Logoff() // teardown; nothing to recover if it fails
	conn.Close()

	if err != nil {
		return nil
	}

	var shares []string
	for _, name := range names {
		if len(name) > 0 && name[len(name)-1] != '$' {
			shares = append(shares, name)
		}
	}
	return shares
}
