package api

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/subtitle"
)

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

	// Allow cross-origin loading for <track> elements in dev (different ports)
	origin := c.Request().Header.Get("Origin")
	if origin != "" {
		c.Response().Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		c.Response().Header().Set("Access-Control-Allow-Origin", "*")
	}

	// Always serve as WebVTT — convert ASS/SRT on the fly
	format := strings.ToLower(sub.Format)
	if format == "ass" || format == "ssa" || format == "srt" || format == "subrip" {
		vtt := subtitle.ToVTT(f, format)
		return c.Blob(http.StatusOK, "text/vtt", []byte(vtt))
	}

	// VTT or unknown — serve as-is
	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}
	c.Response().Header().Set("Content-Type", "text/vtt")
	http.ServeContent(c.Response(), c.Request(), "subtitle.vtt", stat.ModTime(), f)
	return nil
}
