package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

var validSortColumns = map[string]string{
	"filename":       "mf.filename",
	"size_bytes":     "mf.size_bytes",
	"match_status":   "mf.match_status",
	"subtitle_count": "subtitle_count",
}

type mediaFileRow struct {
	ID                 string  `json:"id"`
	LibraryID          string  `json:"library_id"`
	Path               string  `json:"path"`
	Filename           string  `json:"filename"`
	SizeBytes          int64   `json:"size_bytes"`
	MatchStatus        string  `json:"match_status"`
	CreatedAt          string  `json:"created_at"`
	MatchedAnimeTitle  string  `json:"matched_anime_title"`
	MatchedEpisodeSort float64 `json:"matched_episode_sort"`
	MatchedBangumiID   int64   `json:"matched_bangumi_id"`
	SubtitleCount      int64   `json:"subtitle_count"`
}

func (h *handler) listMediaFilesSorted(ctx context.Context, libraryID, status, q, sortCol, sortDir string, limit, offset int64) ([]mediaFileRow, error) {
	query := fmt.Sprintf(`
SELECT mf.id, mf.library_id, mf.path, mf.filename, mf.size_bytes, mf.match_status, mf.created_at,
       COALESCE(a.title, '') AS matched_anime_title,
       COALESCE(e.episode_number, 0) AS matched_episode_sort,
       COALESCE(a.bangumi_id, 0) AS matched_bangumi_id,
       (SELECT COUNT(*) FROM subtitle_files sf WHERE sf.media_file_id = mf.id) AS subtitle_count
FROM media_files mf
LEFT JOIN episodes e ON mf.episode_id = e.id
LEFT JOIN anime a ON e.anime_id = a.id
WHERE mf.library_id = ?
  AND (? = 'all' OR (? = 'matched' AND mf.match_status != 'unmatched') OR mf.match_status = ?)
  AND (? = '' OR mf.filename LIKE '%%' || ? || '%%')
ORDER BY %s %s
LIMIT ? OFFSET ?`, sortCol, sortDir)

	rows, err := h.db.QueryContext(ctx, query,
		libraryID,
		status, status, status,
		q, q,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]mediaFileRow, 0)
	for rows.Next() {
		var r mediaFileRow
		if err := rows.Scan(
			&r.ID,
			&r.LibraryID,
			&r.Path,
			&r.Filename,
			&r.SizeBytes,
			&r.MatchStatus,
			&r.CreatedAt,
			&r.MatchedAnimeTitle,
			&r.MatchedEpisodeSort,
			&r.MatchedBangumiID,
			&r.SubtitleCount,
		); err != nil {
			return nil, err
		}
		items = append(items, r)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	return items, rows.Err()
}

type matchMediaFileRequest struct {
	BangumiID int64 `json:"bangumi_id"`
	EpisodeID int64 `json:"episode_id"`
}

func (h *handler) handleListMediaFiles(c *echo.Context) error {
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

	// Parse sort params
	sortBy := c.QueryParam("sort_by")
	sortCol, ok := validSortColumns[sortBy]
	if !ok {
		sortCol = "mf.filename"
	}

	sortOrder := strings.ToUpper(c.QueryParam("sort_order"))
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	files, err := h.listMediaFilesSorted(c.Request().Context(), libraryID, status, q, sortCol, sortOrder, int64(perPage), int64(offset))
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

func (h *handler) handleMatchMediaFile(c *echo.Context) error {
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

func (h *handler) handleFileTree(c *echo.Context) error {
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
		relPath := strings.TrimPrefix(f.Path, basePath)
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

func (h *handler) handleUnmatchMediaFile(c *echo.Context) error {
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

type bulkMatchRequest struct {
	FileIDs      []string `json:"file_ids"`
	BangumiID    int64    `json:"bangumi_id"`
	EpisodeStart int64    `json:"episode_start"`
}

func (h *handler) handleBulkMatchMediaFiles(c *echo.Context) error {
	var req bulkMatchRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if len(req.FileIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids must not be empty")
	}
	if req.BangumiID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "bangumi_id must be non-zero")
	}
	if len(req.FileIDs) > 500 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids must not exceed 500 entries")
	}

	ctx := c.Request().Context()

	// Look up anime by bangumi ID
	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: req.BangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "anime not found for the given bangumi_id")
		}
		return echo.ErrInternalServerError
	}

	matched := 0
	for i, fileID := range req.FileIDs {
		episodeSort := req.EpisodeStart + int64(i)

		// Look up episode by anime and number
		episode, err := h.queries.GetEpisodeByAnimeAndNumber(ctx, store.GetEpisodeByAnimeAndNumberParams{
			AnimeID:       anime.ID,
			EpisodeNumber: float64(episodeSort),
		})
		if err != nil {
			// Skip files where episode doesn't exist
			continue
		}

		// Set dandanplay match metadata
		if err := h.queries.UpdateMediaFileMatch(ctx, store.UpdateMediaFileMatchParams{
			DandanplayAnimeID:   sql.NullInt64{Int64: req.BangumiID, Valid: true},
			DandanplayEpisodeID: sql.NullInt64{Int64: 0, Valid: false},
			ID:                  fileID,
		}); err != nil {
			continue
		}

		// Link to the resolved episode
		if err := h.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
			EpisodeID: sql.NullString{String: episode.ID, Valid: true},
			ID:        fileID,
		}); err != nil {
			continue
		}

		matched++
	}

	return c.JSON(http.StatusOK, map[string]int{"matched": matched})
}

type bulkUnmatchRequest struct {
	FileIDs []string `json:"file_ids"`
}

func (h *handler) handleBulkUnmatchMediaFiles(c *echo.Context) error {
	var req bulkUnmatchRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if len(req.FileIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids must not be empty")
	}
	if len(req.FileIDs) > 500 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids must not exceed 500 entries")
	}

	ctx := c.Request().Context()

	cleared := 0
	for _, fileID := range req.FileIDs {
		if err := h.queries.ClearMediaFileMatch(ctx, fileID); err != nil {
			continue
		}
		cleared++
	}

	return c.JSON(http.StatusOK, map[string]int{"cleared": cleared})
}
