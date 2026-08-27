package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/integration/dandanplay"
)

func (h *handler) handleGetDanmaku(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("mediaFileId")

	file, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	if !file.DandanplayEpisodeID.Valid || file.DandanplayEpisodeID.Int64 == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "file not matched")
	}

	episodeID := file.DandanplayEpisodeID.Int64
	cacheKey := fmt.Sprintf("danmaku:ddp:%d", episodeID)

	// Check cache
	if data, cacheErr := h.cache.Get(ctx, cacheKey); cacheErr == nil {
		var comments []dandanplay.Comment
		if json.Unmarshal(data, &comments) == nil {
			return c.JSON(http.StatusOK, map[string]any{
				"count":    len(comments),
				"comments": comments,
			})
		}
	}

	// Fetch from DandanPlay
	comments, err := h.dandanplay.GetComments(ctx, episodeID)
	if err != nil {
		return mapDandanplayError(err)
	}

	// Cache
	if data, marshalErr := json.Marshal(comments); marshalErr == nil {
		_ = h.cache.Set(ctx, cacheKey, data, 6*time.Hour)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"count":    len(comments),
		"comments": comments,
	})
}

func (h *handler) handlePostDanmaku(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("mediaFileId")

	file, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	if !file.DandanplayEpisodeID.Valid || file.DandanplayEpisodeID.Int64 == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "file not matched")
	}

	var req dandanplay.PostCommentReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	// The open network caps comments at 100 characters and asks apps not to
	// forward empty or junk submissions.
	req.Comment = strings.TrimSpace(req.Comment)
	if req.Comment == "" || utf8.RuneCountInString(req.Comment) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "comment must be 1-100 characters")
	}
	if userID, ok := c.Get(contextKeyUserID).(string); ok && userID != "" {
		if user, userErr := h.queries.GetUserByID(ctx, userID); userErr == nil {
			req.UserName = user.Username
		}
	}

	episodeID := file.DandanplayEpisodeID.Int64
	if err := h.dandanplay.PostComment(ctx, episodeID, req); err != nil {
		return mapDandanplayError(err)
	}

	// Invalidate cache
	cacheKey := fmt.Sprintf("danmaku:ddp:%d", episodeID)
	_ = h.cache.Del(ctx, cacheKey)

	return c.NoContent(http.StatusNoContent)
}

func mapDandanplayError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, dandanplay.ErrNoCredentials):
		return echo.NewHTTPError(http.StatusServiceUnavailable, "DandanPlay credentials not configured")
	case errors.Is(err, dandanplay.ErrRateLimited):
		return echo.NewHTTPError(http.StatusTooManyRequests, "DandanPlay rate limited")
	case errors.Is(err, dandanplay.ErrAPIError):
		// Surface the upstream message: quota exhausted, comment rejected, etc.
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	case errors.Is(err, dandanplay.ErrUnavailable):
		return echo.NewHTTPError(http.StatusBadGateway, "DandanPlay unavailable")
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal error")
	}
}
