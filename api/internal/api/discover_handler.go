package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
)

func (h *handler) handleCalendar(c echo.Context) error {
	days, err := h.metadata.GetCalendar(c.Request().Context())
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, days)
}

func (h *handler) handleTrending(c echo.Context) error {
	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	results, err := h.metadata.GetTrending(c.Request().Context(), page)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleSearch(c echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q parameter required")
	}
	results, err := h.metadata.Search(c.Request().Context(), q)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleAnimeDetail(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	detail, err := h.metadata.GetAnimeDetail(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, detail)
}

func (h *handler) handleAnimeEpisodes(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	eps, err := h.metadata.GetEpisodes(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, eps)
}

func mapMetadataError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, bangumi.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "anime not found")
	case errors.Is(err, bangumi.ErrRateLimited), errors.Is(err, anilist.ErrRateLimited):
		return echo.NewHTTPError(http.StatusTooManyRequests, "upstream rate limited")
	case errors.Is(err, bangumi.ErrUnavailable), errors.Is(err, anilist.ErrUnavailable), errors.Is(err, anilist.ErrQueryFailed):
		return echo.NewHTTPError(http.StatusBadGateway, "external service unavailable")
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal error")
	}
}
