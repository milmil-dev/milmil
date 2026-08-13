package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

type createSegmentMarkRequest struct {
	Type      string  `json:"type"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
	Source    string  `json:"source"`
}

type segmentMarkResponse struct {
	ID          string  `json:"id"`
	MediaFileID string  `json:"media_file_id"`
	Type        string  `json:"type"`
	StartTime   float64 `json:"start_time"`
	EndTime     float64 `json:"end_time"`
	Source      string  `json:"source"`
	CreatedAt   string  `json:"created_at"`
}

func toSegmentMarkResponse(s store.SegmentMark) segmentMarkResponse {
	return segmentMarkResponse{
		ID:          s.ID,
		MediaFileID: s.MediaFileID,
		Type:        s.Type,
		StartTime:   s.StartTime,
		EndTime:     s.EndTime,
		Source:      s.Source,
		CreatedAt:   s.CreatedAt,
	}
}

func (h *handler) handleCreateSegmentMark(c *echo.Context) error {
	fileID := c.Param("fileId")

	var req createSegmentMarkRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Type == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "type is required")
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	mark, err := h.queries.CreateSegmentMark(c.Request().Context(), store.CreateSegmentMarkParams{
		ID:          uuid.New().String(),
		MediaFileID: fileID,
		Type:        req.Type,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		Source:      req.Source,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusCreated, toSegmentMarkResponse(mark))
}

func (h *handler) handleListSegmentMarks(c *echo.Context) error {
	fileID := c.Param("fileId")

	marks, err := h.queries.ListSegmentMarks(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	result := make([]segmentMarkResponse, len(marks))
	for i, m := range marks {
		result[i] = toSegmentMarkResponse(m)
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleDeleteSegmentMark(c *echo.Context) error {
	segmentID := c.Param("segmentId")

	if err := h.queries.DeleteSegmentMark(c.Request().Context(), segmentID); err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}
