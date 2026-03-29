package api

import (
	"database/sql"
	"net/http"
	"sort"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

var validWatchStatuses = map[string]struct{}{
	"watching":  {},
	"planning":  {},
	"completed": {},
	"paused":    {},
	"dropped":   {},
}

func (h *handler) handleListCollection(c echo.Context) error {
	status := c.QueryParam("status")
	search := c.QueryParam("search")
	sortBy := c.QueryParam("sort")
	if sortBy == "" {
		sortBy = "recent"
	}

	items, err := h.queries.ListCollectionAnime(c.Request().Context(), store.ListCollectionAnimeParams{
		StatusFilter: status,
		SearchQuery:  search,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	if sortBy == "name" {
		sort.Slice(items, func(i, j int) bool {
			return items[i].Title < items[j].Title
		})
	}

	return c.JSON(http.StatusOK, items)
}

func (h *handler) handleListRecentCollection(c echo.Context) error {
	items, err := h.queries.ListRecentlyMatchedAnime(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, items)
}

type updateWatchStatusRequest struct {
	Status string `json:"status"`
}

func (h *handler) handleUpdateWatchStatus(c echo.Context) error {
	bangumiIDStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(bangumiIDStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	var req updateWatchStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	if _, ok := validWatchStatuses[req.Status]; !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "status must be one of: watching, planning, completed, paused, dropped")
	}

	err = h.queries.UpdateAnimeWatchStatus(c.Request().Context(), store.UpdateAnimeWatchStatusParams{
		WatchStatus: req.Status,
		BangumiID:   sql.NullInt64{Int64: bangumiID, Valid: true},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleCollectionStatusCounts(c echo.Context) error {
	counts, err := h.queries.CountCollectionByStatus(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, counts)
}
