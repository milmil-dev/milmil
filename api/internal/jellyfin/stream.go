package jellyfin

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/storage"
)

var videoMimeTypes = map[string]string{
	"mp4":  "video/mp4",
	"mkv":  "video/x-matroska",
	"webm": "video/webm",
	"avi":  "video/x-msvideo",
	"mov":  "video/quicktime",
	"m4v":  "video/x-m4v",
	"ts":   "video/mp2t",
}

func (h *Handler) handleStream(c *echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var fileID string

	switch typ {
	case "file":
		fileID = id
	case "episode":
		files, err := h.queries.ListMediaFilesByEpisodeID(ctx, id)
		if err != nil || len(files) == 0 {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "No media file for episode"})
		}
		fileID = files[0].ID
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Cannot stream this item type"})
	}

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Internal error"})
	}

	lib, err := h.queries.GetLibrary(ctx, mediaFile.LibraryID)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Library not found"})
	}

	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(mediaFile.Path)), ".")
	contentType := videoMimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Response().Header().Set("Content-Type", contentType)

	// Local files
	if lib.SourceType == "local" || lib.SourceType == "" {
		f, err := os.Open(mediaFile.Path)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not on disk"})
		}
		defer f.Close()
		stat, _ := f.Stat()
		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), f)
		return nil
	}

	// Remote files
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Cannot decrypt storage config"})
		}
		configJSON = decrypted
	}
	provider, err := storage.NewProvider(lib.SourceType, configJSON)
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, JellyfinError{Message: "Storage backend unavailable"})
	}
	defer provider.Close()

	reader, err := provider.Open(mediaFile.Path)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not accessible"})
	}
	defer reader.Close()

	if rs, ok := reader.(io.ReadSeeker); ok {
		stat, _ := provider.Stat(mediaFile.Path)
		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), rs)
		return nil
	}

	c.Response().Header().Set("Content-Disposition", "inline")
	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response(), reader)
	return err
}
