package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/danmaku"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleListDanmakuSources(c echo.Context) error {
	names := h.danmakuRegistry.Names()
	type sourceInfo struct {
		Name  string `json:"name"`
		Label string `json:"label"`
	}
	sources := make([]sourceInfo, 0, len(names))
	for _, name := range names {
		sources = append(sources, sourceInfo{Name: name, Label: name})
	}
	return c.JSON(http.StatusOK, sources)
}

func (h *handler) handleSearchExternalDanmaku(c echo.Context) error {
	sourceName := c.QueryParam("source")
	keyword := c.QueryParam("q")
	pageStr := c.QueryParam("page")

	if sourceName == "" || keyword == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source and q are required")
	}

	source, ok := h.danmakuRegistry.Get(sourceName)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown source: "+sourceName)
	}

	page := 1
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	ctx := c.Request().Context()
	results, err := source.Search(ctx, keyword, page)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "search failed: "+err.Error())
	}

	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleGetVideoParts(c echo.Context) error {
	sourceName := c.QueryParam("source")
	videoID := c.QueryParam("videoId")

	if sourceName == "" || videoID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source and videoId are required")
	}

	source, ok := h.danmakuRegistry.Get(sourceName)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown source: "+sourceName)
	}

	ctx := c.Request().Context()
	parts, err := source.GetParts(ctx, videoID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to get parts: "+err.Error())
	}

	return c.JSON(http.StatusOK, parts)
}

func (h *handler) handleImportExternalDanmaku(c echo.Context) error {
	var req struct {
		Source      string `json:"source"`
		VideoID     string `json:"videoId"`
		MediaFileID string `json:"mediaFileId"`
		PartIndex   int    `json:"partIndex"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Source == "" || req.VideoID == "" || req.MediaFileID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source, videoId, and mediaFileId are required")
	}

	source, ok := h.danmakuRegistry.Get(req.Source)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown source: "+req.Source)
	}

	ctx := c.Request().Context()
	comments, err := source.FetchDanmaku(ctx, req.VideoID, req.PartIndex)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "fetch failed: "+err.Error())
	}

	// Always cache first (24h TTL)
	data, _ := json.Marshal(comments)
	cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", req.MediaFileID, req.Source)
	_ = h.cache.Set(ctx, cacheKey, data, 24*time.Hour)

	return c.JSON(http.StatusOK, map[string]any{
		"source":   req.Source,
		"count":    len(comments),
		"saved":    false,
		"comments": comments,
	})
}

func (h *handler) handleToggleSaveDanmaku(c echo.Context) error {
	mediaFileID := c.Param("mediaFileId")
	var req struct {
		Source string `json:"source"`
		Save   bool   `json:"save"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	ctx := c.Request().Context()

	if req.Save {
		// Promote: read from cache, write to DB, delete cache
		cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, req.Source)
		data, err := h.cache.Get(ctx, cacheKey)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "no cached danmaku to save")
		}

		var comments []danmaku.Comment
		if err := json.Unmarshal(data, &comments); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "corrupt cache data")
		}

		_, dbErr := h.queries.UpsertExternalDanmaku(ctx, store.UpsertExternalDanmakuParams{
			MediaFileID:  mediaFileID,
			Source:       req.Source,
			VideoID:      "",
			PartIndex:    0,
			CommentsJson: string(data),
			CommentCount: int64(len(comments)),
		})
		if dbErr != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "save failed: "+dbErr.Error())
		}
		_ = h.cache.Del(ctx, cacheKey)
	} else {
		// Demote: read from DB, write to cache, delete from DB
		rows, err := h.queries.GetExternalDanmakuByMediaFile(ctx, mediaFileID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "read failed")
		}
		for _, row := range rows {
			if row.Source == req.Source {
				cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, req.Source)
				_ = h.cache.Set(ctx, cacheKey, []byte(row.CommentsJson), 24*time.Hour)
				_ = h.queries.DeleteExternalDanmaku(ctx, store.DeleteExternalDanmakuParams{
					MediaFileID: mediaFileID,
					Source:      req.Source,
				})
				break
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{"saved": req.Save})
}

func (h *handler) handleGetImportedDanmaku(c echo.Context) error {
	mediaFileID := c.Param("mediaFileId")
	ctx := c.Request().Context()

	type importedSource struct {
		Source   string            `json:"source"`
		Count   int               `json:"count"`
		Saved   bool              `json:"saved"`
		Comments []danmaku.Comment `json:"comments"`
	}

	seen := make(map[string]bool)
	var imported []importedSource

	// 1. Load from database (permanent)
	dbRows, err := h.queries.GetExternalDanmakuByMediaFile(ctx, mediaFileID)
	if err == nil {
		for _, row := range dbRows {
			var comments []danmaku.Comment
			if json.Unmarshal([]byte(row.CommentsJson), &comments) == nil && len(comments) > 0 {
				imported = append(imported, importedSource{
					Source:   row.Source,
					Count:    len(comments),
					Saved:    true,
					Comments: comments,
				})
				seen[row.Source] = true
			}
		}
	}

	// 2. Load from cache (temporary, skip sources already in DB)
	for _, name := range h.danmakuRegistry.Names() {
		if seen[name] {
			continue
		}
		cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, name)
		data, cacheErr := h.cache.Get(ctx, cacheKey)
		if cacheErr != nil {
			continue
		}
		var comments []danmaku.Comment
		if json.Unmarshal(data, &comments) == nil && len(comments) > 0 {
			imported = append(imported, importedSource{
				Source:   name,
				Count:    len(comments),
				Saved:    false,
				Comments: comments,
			})
		}
	}

	return c.JSON(http.StatusOK, imported)
}

func (h *handler) handleRemoveImportedDanmaku(c echo.Context) error {
	mediaFileID := c.Param("mediaFileId")
	sourceName := c.QueryParam("source")
	ctx := c.Request().Context()

	if sourceName != "" {
		// Remove from both DB and cache
		_ = h.queries.DeleteExternalDanmaku(ctx, store.DeleteExternalDanmakuParams{
			MediaFileID: mediaFileID,
			Source:      sourceName,
		})
		cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, sourceName)
		_ = h.cache.Del(ctx, cacheKey)
	} else {
		// Remove all
		_ = h.queries.DeleteAllExternalDanmaku(ctx, mediaFileID)
		for _, name := range h.danmakuRegistry.Names() {
			cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, name)
			_ = h.cache.Del(ctx, cacheKey)
		}
	}

	return c.NoContent(http.StatusNoContent)
}
