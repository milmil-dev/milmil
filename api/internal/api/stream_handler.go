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

var mimeTypes = map[string]string{
	".mp4":  "video/mp4",
	".mkv":  "video/x-matroska",
	".webm": "video/webm",
	".avi":  "video/x-msvideo",
	".mov":  "video/quicktime",
	".m4v":  "video/x-m4v",
	".ts":   "video/mp2t",
	".flv":  "video/x-flv",
}

func (h *handler) handleStreamDirect(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	f, err := os.Open(mediaFile.Path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "file not on disk")
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}

	ext := strings.ToLower(filepath.Ext(mediaFile.Path))
	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("Content-Type", contentType)
	http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), f)
	return nil
}
