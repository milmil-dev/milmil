package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/library/completeness"
)

func (h *handler) handleAnimeMissing(c *echo.Context) error {
	ctx := c.Request().Context()
	idStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	report, err := completeness.BuildReport(ctx, h.queries, anime.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, report)
}

func (h *handler) handleLibraryMissingSummary(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	reports, err := completeness.BuildLibrarySummary(ctx, h.queries, libraryID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	// Guard against nil so JSON emits `[]` not `null` even if the analyzer
	// ever returns nil (it doesn't today).
	if reports == nil {
		reports = []completeness.Report{}
	}
	return c.JSON(http.StatusOK, reports)
}
