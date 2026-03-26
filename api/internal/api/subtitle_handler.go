package api

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

var subtitleMimeTypes = map[string]string{
	".vtt": "text/vtt",
	".srt": "application/x-subrip",
	".ass": "text/x-ssa",
	".ssa": "text/x-ssa",
}

func (h *handler) handleListSubtitles(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	subs, err := h.queries.ListSubtitlesByMediaFile(ctx, fileID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, subs)
}

func (h *handler) handleSubtitleContent(c echo.Context) error {
	ctx := c.Request().Context()
	id := c.Param("id")

	sub, err := h.queries.GetSubtitleFile(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "subtitle not found")
		}
		return echo.ErrInternalServerError
	}

	f, err := os.Open(sub.Path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "subtitle file not on disk")
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}

	ext := strings.ToLower(filepath.Ext(sub.Path))
	contentType := subtitleMimeTypes[ext]
	if contentType == "" {
		contentType = "text/plain"
	}

	c.Response().Header().Set("Content-Type", contentType)
	http.ServeContent(c.Response(), c.Request(), filepath.Base(sub.Path), stat.ModTime(), f)
	return nil
}
