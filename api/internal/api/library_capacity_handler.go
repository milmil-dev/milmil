package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"syscall"

	"github.com/labstack/echo/v4"
)

type libraryCapacityResponse struct {
	TotalBytes int64 `json:"total_bytes"`
	FreeBytes  int64 `json:"free_bytes"`
	UsedBytes  int64 `json:"used_bytes"`
	Available  bool  `json:"available"`
}

// handleGetLibraryCapacity returns disk usage statistics for a library's path.
// Only supported for local source types — remote sources return Available=false.
func (h *handler) handleGetLibraryCapacity(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("failed to get library for capacity", "id", c.Param("id"), "err", err)
		return echo.ErrInternalServerError
	}

	if lib.SourceType != "local" && lib.SourceType != "" {
		return c.JSON(http.StatusOK, libraryCapacityResponse{Available: false})
	}

	var stat syscall.Statfs_t
	if err := syscall.Statfs(lib.Path, &stat); err != nil {
		// Path doesn't exist or not accessible — report unavailable, don't 500.
		return c.JSON(http.StatusOK, libraryCapacityResponse{Available: false})
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
	})
}
