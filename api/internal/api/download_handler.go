package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type addDownloadRequest struct {
	URL     string `json:"url"`
	Name    string `json:"name"`
	SaveDir string `json:"save_dir"`
}

func (h *handler) handleListDownloads(c echo.Context) error {
	downloads, err := h.queries.ListDownloads(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, downloads)
}

func (h *handler) handleAddDownload(c echo.Context) error {
	var req addDownloadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url is required")
	}

	opts := map[string]string{}
	if req.SaveDir != "" {
		opts["dir"] = req.SaveDir
	}

	gid, err := h.aria2.AddURI(c.Request().Context(), []string{req.URL}, opts)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "aria2 error: "+err.Error())
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
	return c.JSON(http.StatusCreated, dl)
}

func (h *handler) handlePauseDownload(c echo.Context) error {
	gid := c.Param("gid")
	if err := h.aria2.Pause(c.Request().Context(), gid); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "aria2 error: "+err.Error())
	}
	if err := h.queries.UpdateDownloadStatus(c.Request().Context(), store.UpdateDownloadStatusParams{
		Gid:    gid,
		Status: "paused",
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "paused"})
}

func (h *handler) handleResumeDownload(c echo.Context) error {
	gid := c.Param("gid")
	if err := h.aria2.Resume(c.Request().Context(), gid); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "aria2 error: "+err.Error())
	}
	if err := h.queries.UpdateDownloadStatus(c.Request().Context(), store.UpdateDownloadStatusParams{
		Gid:    gid,
		Status: "active",
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "active"})
}

func (h *handler) handleDeleteDownload(c echo.Context) error {
	gid := c.Param("gid")

	// Try to remove from aria2 (ignore error if already removed)
	_ = h.aria2.Remove(c.Request().Context(), gid)

	// Check if download exists before deleting
	_, err := h.queries.GetDownloadByGID(c.Request().Context(), gid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	if err := h.queries.DeleteDownload(c.Request().Context(), gid); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
