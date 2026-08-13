package api

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type addDownloadRequest struct {
	URL     string `json:"url"`
	Name    string `json:"name"`
	SaveDir string `json:"save_dir"`
}

func (h *handler) handleListDownloads(c *echo.Context) error {
	downloads, err := h.queries.ListDownloads(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, downloads)
}

func (h *handler) handleAddDownload(c *echo.Context) error {
	var req addDownloadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url is required")
	}

	gid, err := h.downloader.Add(c.Request().Context(), req.URL, downloader.AddOptions{
		SaveDir: req.SaveDir,
		Name:    req.Name,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "download error: "+err.Error())
	}

	name := req.Name
	if name == "" {
		name = req.URL
	}

	dl, err := h.queries.CreateDownload(c.Request().Context(), store.CreateDownloadParams{
		ID:      uuid.NewString(),
		Gid:     gid,
		Url:     req.URL,
		Name:    name,
		Status:  "active",
		SaveDir: req.SaveDir,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	if h.wsHub != nil {
		h.wsHub.Broadcast(ws.Event{Type: "download:added", Data: map[string]any{"gid": gid, "name": name}})
	}
	return c.JSON(http.StatusCreated, dl)
}

func (h *handler) handlePauseDownload(c *echo.Context) error {
	gid := c.Param("gid")
	if err := h.downloader.Pause(c.Request().Context(), gid); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "download error: "+err.Error())
	}
	if err := h.queries.UpdateDownloadStatus(c.Request().Context(), store.UpdateDownloadStatusParams{
		Gid:    gid,
		Status: "paused",
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "paused"})
}

func (h *handler) handleResumeDownload(c *echo.Context) error {
	gid := c.Param("gid")
	if err := h.downloader.Resume(c.Request().Context(), gid); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "download error: "+err.Error())
	}
	if err := h.queries.UpdateDownloadStatus(c.Request().Context(), store.UpdateDownloadStatusParams{
		Gid:    gid,
		Status: "active",
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "active"})
}

func (h *handler) handleDeleteDownload(c *echo.Context) error {
	gid := c.Param("gid")
	deleteFiles := c.QueryParam("delete_files") == "true"
	ctx := c.Request().Context()

	// Remove from download engine (handles file deletion if requested)
	if err := h.downloader.Remove(ctx, gid, deleteFiles); err != nil {
		slog.Warn("download: remove from engine", "gid", gid, "err", err)
	}

	// Fallback: if delete_files requested, also try manual file removal
	// in case the engine didn't have the download tracked
	if deleteFiles {
		dl, err := h.queries.GetDownloadByGID(ctx, gid)
		if err == nil {
			h.deleteDownloadFiles(dl)
		}
	}

	if err := h.queries.DeleteDownload(ctx, gid); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

// handleBatchDeleteDownloads removes all downloads, optionally deleting files.
// DELETE /downloads/batch?delete_files=true
func (h *handler) handleBatchDeleteDownloads(c *echo.Context) error {
	deleteFiles := c.QueryParam("delete_files") == "true"
	ctx := c.Request().Context()

	downloads, err := h.queries.ListDownloads(ctx)
	if err != nil {
		return echo.ErrInternalServerError
	}

	deleted := 0
	for _, dl := range downloads {
		if err := h.downloader.Remove(ctx, dl.Gid, deleteFiles); err != nil {
			slog.Warn("batch_delete: remove from engine", "gid", dl.Gid, "err", err)
		}
		if deleteFiles {
			h.deleteDownloadFiles(dl)
		}
		if err := h.queries.DeleteDownload(ctx, dl.Gid); err != nil {
			slog.Error("batch_delete: delete download", "gid", dl.Gid, "err", err)
			continue
		}
		deleted++
	}

	return c.JSON(http.StatusOK, map[string]int{"deleted": deleted})
}

// deleteDownloadFiles removes downloaded files from disk using save_dir + name.
func (h *handler) deleteDownloadFiles(dl store.Download) {
	if dl.SaveDir == "" || dl.Name == "" {
		return
	}
	path := filepath.Join(dl.SaveDir, dl.Name)
	info, err := os.Stat(path)
	if err != nil {
		return
	}
	if info.IsDir() {
		if err := os.RemoveAll(path); err != nil {
			slog.Error("delete_files: remove dir", "path", path, "err", err)
		} else {
			slog.Info("delete_files: removed dir", "path", path)
		}
	} else {
		if err := os.Remove(path); err != nil {
			slog.Error("delete_files: remove file", "path", path, "err", err)
		} else {
			slog.Info("delete_files: removed", "path", path)
		}
	}
}

// handleDownloaderStatus returns the health status of the builtin download engine.
func (h *handler) handleDownloaderStatus(c *echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"engine":  "builtin",
		"healthy": h.downloader.Healthy(),
	})
}
