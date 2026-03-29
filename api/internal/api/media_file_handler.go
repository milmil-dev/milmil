package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

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
