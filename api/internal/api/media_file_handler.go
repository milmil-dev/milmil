package api

import (
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type matchMediaFileRequest struct {
	BangumiID int64 `json:"bangumi_id"`
	EpisodeID int64 `json:"episode_id"`
}

func (h *handler) handleListMediaFiles(c echo.Context) error {
	libraryID := c.Param("id")

	// Check library exists
	_, err := h.queries.GetLibrary(c.Request().Context(), libraryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	// Parse query params
	status := c.QueryParam("status")
	if status == "" {
		status = "all"
	}
	q := c.QueryParam("q")

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))
	if perPage < 1 {
		perPage = 50
	}
	if perPage > 100 {
		perPage = 100
	}

	offset := (page - 1) * perPage

	files, err := h.queries.ListMediaFilesByLibrary(c.Request().Context(), store.ListMediaFilesByLibraryParams{
		LibraryID:   libraryID,
		Column2:     status,
		Column3:     status,
		MatchStatus: status,
		Column5:     q,
		Column6:     sql.NullString{String: q, Valid: q != ""},
		Limit:       int64(perPage),
		Offset:      int64(offset),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	total, err := h.queries.CountMediaFilesByStatus(c.Request().Context(), store.CountMediaFilesByStatusParams{
		LibraryID:   libraryID,
		Column2:     status,
		Column3:     status,
		MatchStatus: status,
		Column5:     q,
		Column6:     sql.NullString{String: q, Valid: q != ""},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items":    files,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (h *handler) handleMatchMediaFile(c echo.Context) error {
	fileID := c.Param("id")

	var req matchMediaFileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.BangumiID == 0 || req.EpisodeID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "bangumi_id and episode_id are required and must be non-zero")
	}

	// Check file exists
	_, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	// Update match
	if err := h.queries.UpdateMediaFileMatch(c.Request().Context(), store.UpdateMediaFileMatchParams{
		DandanplayAnimeID:   sql.NullInt64{Int64: req.BangumiID, Valid: req.BangumiID != 0},
		DandanplayEpisodeID: sql.NullInt64{Int64: req.EpisodeID, Valid: req.EpisodeID != 0},
		ID:                  fileID,
	}); err != nil {
		return echo.ErrInternalServerError
	}

	// Return updated file
	updated, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, updated)
}

func (h *handler) handleFileTree(c echo.Context) error {
	libraryID := c.Param("id")

	// Check library exists
	lib, err := h.queries.GetLibrary(c.Request().Context(), libraryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	files, err := h.queries.ListMediaFileTreeByLibrary(c.Request().Context(), libraryID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Build tree structure from flat file list
	type treeFile struct {
		ID                 string  `json:"id"`
		Filename           string  `json:"filename"`
		SizeBytes          int64   `json:"size_bytes"`
		MatchStatus        string  `json:"match_status"`
		MatchedAnimeTitle  string  `json:"matched_anime_title"`
		MatchedEpisodeSort float64 `json:"matched_episode_sort"`
		MatchedBangumiID   int64   `json:"matched_bangumi_id"`
		SubtitleCount      int64   `json:"subtitle_count"`
	}
	type treeNode struct {
		Name      string      `json:"name"`
		Path      string      `json:"path"`
		Children  []*treeNode `json:"children,omitempty"`
		Files     []treeFile  `json:"files,omitempty"`
		FileCount int         `json:"file_count"`
		SizeBytes int64       `json:"size_bytes"`
	}

	// Strip library base path prefix from file paths
	basePath := filepath.Clean(lib.Path) + "/"

	root := &treeNode{Name: lib.Name, Path: "/"}
	nodeMap := map[string]*treeNode{"/": root}

	for _, f := range files {
		// Get relative directory by stripping the library base path
		relPath := f.Path
		if strings.HasPrefix(relPath, basePath) {
			relPath = relPath[len(basePath):]
		}
		dir := filepath.Dir(relPath)

		// Split directory into parts
		var parts []string
		if dir != "." && dir != "/" && dir != "" {
			parts = strings.Split(filepath.ToSlash(dir), "/")
		}

		// Navigate/create directory nodes
		current := root
		currentPath := "/"
		for _, part := range parts {
			if part == "" {
				continue
			}
			if currentPath == "/" {
				currentPath = "/" + part
			} else {
				currentPath = currentPath + "/" + part
			}
			if node, ok := nodeMap[currentPath]; ok {
				current = node
			} else {
				node := &treeNode{Name: part, Path: currentPath}
				current.Children = append(current.Children, node)
				nodeMap[currentPath] = node
				current = node
			}
		}

		// Add file to current directory
		current.Files = append(current.Files, treeFile{
			ID:                 f.ID,
			Filename:           f.Filename,
			SizeBytes:          f.SizeBytes,
			MatchStatus:        f.MatchStatus,
			MatchedAnimeTitle:  f.MatchedAnimeTitle,
			MatchedEpisodeSort: f.MatchedEpisodeSort,
			MatchedBangumiID:   f.MatchedBangumiID,
			SubtitleCount:      f.SubtitleCount,
		})
	}

	// Calculate cumulative counts
	var accumulate func(n *treeNode)
	accumulate = func(n *treeNode) {
		n.FileCount = len(n.Files)
		n.SizeBytes = 0
		for _, f := range n.Files {
			n.SizeBytes += f.SizeBytes
		}
		for _, child := range n.Children {
			accumulate(child)
			n.FileCount += child.FileCount
			n.SizeBytes += child.SizeBytes
		}
	}
	accumulate(root)

	return c.JSON(http.StatusOK, root)
}

func (h *handler) handleUnmatchMediaFile(c echo.Context) error {
	fileID := c.Param("id")

	// Check file exists
	_, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	if err := h.queries.ClearMediaFileMatch(c.Request().Context(), fileID); err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}
