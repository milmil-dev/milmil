package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/integration/danmaku"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleListDanmakuSources(c *echo.Context) error {
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

func (h *handler) handleSearchExternalDanmaku(c *echo.Context) error {
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

func (h *handler) handleGetVideoParts(c *echo.Context) error {
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

// cacheKey builds a stable cache key using episodeId (survives library rescans).
func extCacheKey(episodeID, source string) string {
	return fmt.Sprintf("danmaku:ext:%s:%s", episodeID, source)
}

func (h *handler) handleImportExternalDanmaku(c *echo.Context) error {
	var req struct {
		Source    string `json:"source"`
		VideoID   string `json:"videoId"`
		EpisodeID string `json:"episodeId"`
		PartIndex int    `json:"partIndex"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Source == "" || req.VideoID == "" || req.EpisodeID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source, videoId, and episodeId are required")
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

	data, _ := json.Marshal(comments)
	_ = h.cache.Set(ctx, extCacheKey(req.EpisodeID, req.Source), data, 24*time.Hour)

	return c.JSON(http.StatusOK, map[string]any{
		"source":   req.Source,
		"count":    len(comments),
		"saved":    false,
		"comments": comments,
	})
}

func (h *handler) handleToggleSaveDanmaku(c *echo.Context) error {
	episodeID := c.Param("episodeId")
	var req struct {
		Source string `json:"source"`
		Save   bool   `json:"save"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	ctx := c.Request().Context()
	ck := extCacheKey(episodeID, req.Source)

	if req.Save {
		data, err := h.cache.Get(ctx, ck)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "no cached danmaku to save")
		}
		var comments []danmaku.Comment
		if err := json.Unmarshal(data, &comments); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "corrupt cache data")
		}
		_, dbErr := h.queries.UpsertExternalDanmaku(ctx, store.UpsertExternalDanmakuParams{
			MediaFileID:  episodeID, // reuse column for episodeId
			Source:       req.Source,
			VideoID:      "",
			PartIndex:    0,
			CommentsJson: string(data),
			CommentCount: int64(len(comments)),
		})
		if dbErr != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "save failed: "+dbErr.Error())
		}
		_ = h.cache.Del(ctx, ck)
	} else {
		rows, err := h.queries.GetExternalDanmakuByMediaFile(ctx, episodeID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "read failed")
		}
		for _, row := range rows {
			if row.Source == req.Source {
				_ = h.cache.Set(ctx, ck, []byte(row.CommentsJson), 24*time.Hour)
				_ = h.queries.DeleteExternalDanmaku(ctx, store.DeleteExternalDanmakuParams{
					MediaFileID: episodeID,
					Source:      req.Source,
				})
				break
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{"saved": req.Save})
}

func (h *handler) handleGetImportedDanmaku(c *echo.Context) error {
	episodeID := c.Param("episodeId")
	ctx := c.Request().Context()

	type importedSource struct {
		Source   string            `json:"source"`
		Count    int               `json:"count"`
		Saved    bool              `json:"saved"`
		Comments []danmaku.Comment `json:"comments"`
	}

	seen := make(map[string]bool)
	var imported []importedSource

	// 1. DB (permanent) — media_file_id column stores episodeId
	dbRows, err := h.queries.GetExternalDanmakuByMediaFile(ctx, episodeID)
	if err == nil {
		for _, row := range dbRows {
			var comments []danmaku.Comment
			if json.Unmarshal([]byte(row.CommentsJson), &comments) == nil && len(comments) > 0 {
				imported = append(imported, importedSource{
					Source: row.Source, Count: len(comments), Saved: true, Comments: comments,
				})
				seen[row.Source] = true
			}
		}
	}

	// 2. Cache (temporary)
	for _, name := range h.danmakuRegistry.Names() {
		if seen[name] {
			continue
		}
		data, cacheErr := h.cache.Get(ctx, extCacheKey(episodeID, name))
		if cacheErr != nil {
			continue
		}
		var comments []danmaku.Comment
		if json.Unmarshal(data, &comments) == nil && len(comments) > 0 {
			imported = append(imported, importedSource{
				Source: name, Count: len(comments), Saved: false, Comments: comments,
			})
		}
	}

	return c.JSON(http.StatusOK, imported)
}

func (h *handler) handleRemoveImportedDanmaku(c *echo.Context) error {
	episodeID := c.Param("episodeId")
	sourceName := c.QueryParam("source")
	ctx := c.Request().Context()

	if sourceName != "" {
		_ = h.queries.DeleteExternalDanmaku(ctx, store.DeleteExternalDanmakuParams{
			MediaFileID: episodeID, Source: sourceName,
		})
		_ = h.cache.Del(ctx, extCacheKey(episodeID, sourceName))
	} else {
		_ = h.queries.DeleteAllExternalDanmaku(ctx, episodeID)
		for _, name := range h.danmakuRegistry.Names() {
			_ = h.cache.Del(ctx, extCacheKey(episodeID, name))
		}
	}

	return c.NoContent(http.StatusNoContent)
}
