package api

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/labstack/echo/v5"
	"golang.org/x/mod/semver"

	"github.com/milmil/api/internal/version"
)

var startTime = time.Now()

type systemInfoResponse struct {
	Version  string `json:"version"`
	Uptime   string `json:"uptime"`
	GoVer    string `json:"go_version"`
	Platform string `json:"platform"`
}

func (h *handler) handleSystemInfo(c *echo.Context) error {
	uptime := time.Since(startTime).Truncate(time.Second)
	return c.JSON(http.StatusOK, systemInfoResponse{
		Version:  version.Version,
		Uptime:   uptime.String(),
		GoVer:    runtime.Version(),
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
	})
}

type storageStatsResponse struct {
	TotalSize int64 `json:"total_size"`
	FileCount int   `json:"file_count"`
}

func (h *handler) handleStorageStats(c *echo.Context) error {
	transcodeDir := filepath.Join(os.TempDir(), "milmil", "transcode")

	var totalSize int64
	var fileCount int

	_ = filepath.Walk(transcodeDir, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			totalSize += info.Size()
			fileCount++
		}
		return nil
	})

	return c.JSON(http.StatusOK, storageStatsResponse{
		TotalSize: totalSize,
		FileCount: fileCount,
	})
}

func (h *handler) handleClearTranscodeCache(c *echo.Context) error {
	transcodeDir := filepath.Join(os.TempDir(), "milmil", "transcode")
	if err := os.RemoveAll(transcodeDir); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

type updateCheckResponse struct {
	Current     string  `json:"current"`
	Latest      *string `json:"latest"`
	HasUpdate   bool    `json:"has_update"`
	ReleaseURL  *string `json:"release_url,omitempty"`
	PublishedAt *string `json:"published_at,omitempty"`
	Stale       bool    `json:"stale"`
}

func (h *handler) handleUpdateCheck(c *echo.Context) error {
	res, stale, err := h.updateChecker.Check(c.Request().Context())
	current := version.Version
	if err != nil || res == nil {
		// Never-cached + offline: silent, return only the current version.
		return c.JSON(http.StatusOK, updateCheckResponse{Current: current})
	}
	hasUpdate := semver.Compare("v"+current, "v"+res.Latest) < 0
	publishedAt := res.PublishedAt.UTC().Format(time.RFC3339)
	return c.JSON(http.StatusOK, updateCheckResponse{
		Current: current, Latest: &res.Latest, HasUpdate: hasUpdate,
		ReleaseURL: &res.ReleaseURL, PublishedAt: &publishedAt, Stale: stale,
	})
}
