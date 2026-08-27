package api

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"syscall"
	"time"

	"github.com/labstack/echo/v5"

	"github.com/milmil/api/internal/store"
)

type libraryCapacityResponse struct {
	TotalBytes int64 `json:"total_bytes"`
	FreeBytes  int64 `json:"free_bytes"`
	UsedBytes  int64 `json:"used_bytes"`
	Available  bool  `json:"available"`
	// Bytes of downloads that completed into this library since the first
	// of the current month (UTC) — "this month I pulled 42 GB".
	DownloadedThisMonthBytes int64 `json:"downloaded_this_month_bytes"`
}

// downloadedThisMonth sums completed downloads for the library since the
// start of the current UTC month; `updated_at` is written in RFC 3339 UTC.
func (h *handler) downloadedThisMonth(ctx context.Context, libraryID string) int64 {
	now := time.Now().UTC()
	since := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02T15:04:05Z")
	bytes, err := h.queries.SumCompletedDownloadBytesSince(ctx, store.SumCompletedDownloadBytesSinceParams{
		LibraryID: sql.NullString{String: libraryID, Valid: true},
		UpdatedAt: since,
	})
	if err != nil {
		return 0
	}
	return bytes
}

// handleGetLibraryCapacity returns disk usage statistics for a library's path.
// Only supported for local source types — remote sources return Available=false.
func (h *handler) handleGetLibraryCapacity(c *echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to get library for capacity", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}

	monthly := h.downloadedThisMonth(c.Request().Context(), lib.ID)
	if lib.SourceType != "local" && lib.SourceType != "" {
		return c.JSON(http.StatusOK, libraryCapacityResponse{Available: false, DownloadedThisMonthBytes: monthly})
	}

	var stat syscall.Statfs_t
	if err := syscall.Statfs(lib.Path, &stat); err != nil {
		// Path doesn't exist or not accessible — report unavailable, don't 500.
		return c.JSON(http.StatusOK, libraryCapacityResponse{Available: false, DownloadedThisMonthBytes: monthly})
	}

	// Bsize may be uint32 on some platforms; cast safely.
	bsize := int64(stat.Bsize)
	total := int64(stat.Blocks) * bsize
	free := int64(stat.Bavail) * bsize
	used := total - free
	if used < 0 {
		used = 0
	}

	return c.JSON(http.StatusOK, libraryCapacityResponse{
		TotalBytes: total,
		FreeBytes:  free,
		UsedBytes:  used,
		Available:  true,

		DownloadedThisMonthBytes: monthly,
	})
}
