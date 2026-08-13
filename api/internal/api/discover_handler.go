package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/search"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleCalendar(c *echo.Context) error {
	ctx := c.Request().Context()
	days, err := h.metadata.GetCalendar(ctx)
	if err != nil {
		return mapMetadataError(err)
	}
	locale := h.preferredLocale(c)
	for i := range days {
		h.enrichSummariesWithTMDB(ctx, days[i].Items, locale, false)
	}
	return c.JSON(http.StatusOK, days)
}

func (h *handler) handleTrending(c *echo.Context) error {
	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	ctx := c.Request().Context()
	results, err := h.metadata.GetTrending(ctx, page)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichSummariesWithTMDB(ctx, results, h.preferredLocale(c), false)
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleSearch(c *echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q parameter required")
	}
	isAdult := c.QueryParam("adult") == "true"

	variants := search.GenerateVariants(q)
	ctx := c.Request().Context()
	results, err := h.metadata.SearchWithVariants(ctx, variants, isAdult)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichSummariesWithTMDB(ctx, results, h.preferredLocale(c), false)
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleAnimeDetail(c *echo.Context) error {
	rawID := c.Param("id")
	ctx := c.Request().Context()
	refresh := c.QueryParam("refresh") == "true"

	// AniList-only: id starts with "al-"
	if after, ok := strings.CutPrefix(rawID, "al-"); ok {
		alID, err := strconv.Atoi(after)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid anilist id")
		}
		detail, err := h.metadata.GetAnimeDetailByAniList(ctx, alID, refresh)
		if err != nil {
			return mapMetadataError(err)
		}
		h.enrichAnimeDetailWithTMDB(ctx, detail, h.preferredLocale(c), refresh)
		return c.JSON(http.StatusOK, detail)
	}

	id, err := strconv.Atoi(rawID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	detail, err := h.metadata.GetAnimeDetail(ctx, id, refresh)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichAnimeDetailWithTMDB(ctx, detail, h.preferredLocale(c), refresh)
	return c.JSON(http.StatusOK, detail)
}

func (h *handler) handleAnimeFranchise(c *echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	result, err := h.metadata.GetFranchise(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleBrowseByGenre(c *echo.Context) error {
	genre := c.QueryParam("genre")
	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}

	// Check for advanced filter params — use new Browse method if any are present
	sort := c.QueryParam("sort")
	yearStr := c.QueryParam("year")
	season := c.QueryParam("season")
	minScoreStr := c.QueryParam("min_score")
	status := c.QueryParam("status")

	// Parse comma-separated genres for multi-select
	var genres []string
	if genre != "" {
		genres = strings.Split(genre, ",")
	}

	format := c.QueryParam("format")
	isAdult := c.QueryParam("adult") == "true"

	hasAdvanced := sort != "" || yearStr != "" || season != "" || minScoreStr != "" || status != "" || format != "" || isAdult || len(genres) > 1

	ctx := c.Request().Context()
	locale := h.preferredLocale(c)

	if !hasAdvanced && len(genres) == 1 {
		// Legacy path: single genre browse
		results, err := h.metadata.BrowseByGenre(ctx, genres[0], page)
		if err != nil {
			return mapMetadataError(err)
		}
		h.enrichSummariesWithTMDB(ctx, results, locale, false)
		return c.JSON(http.StatusOK, results)
	}

	// Advanced browse with filters
	var year, minScore int
	if yearStr != "" {
		if v, err := strconv.Atoi(yearStr); err == nil && v > 1900 {
			year = v
		}
	}
	if minScoreStr != "" {
		if v, err := strconv.Atoi(minScoreStr); err == nil && v > 0 && v <= 100 {
			minScore = v
		}
	}

	filter := metadata.BrowseFilter{
		Genres:   genres,
		Sort:     sort,
		Year:     year,
		Season:   season,
		MinScore: minScore,
		Status:   status,
		Format:   format,
		IsAdult:  isAdult,
	}
	results, err := h.metadata.Browse(ctx, filter, page)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichSummariesWithTMDB(ctx, results, locale, false)
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleBrowseByTag(c *echo.Context) error {
	tag := c.QueryParam("tag")
	if tag == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "tag parameter required")
	}
	tags := strings.Split(tag, ",")
	sort := c.QueryParam("sort")

	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}

	ctx := c.Request().Context()
	results, err := h.metadata.BrowseByTag(ctx, tags, sort, page)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichSummariesWithTMDB(ctx, results, h.preferredLocale(c), false)
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleHotTags(c *echo.Context) error {
	category := c.QueryParam("category")
	var (
		tags []store.HotTag
		err  error
	)
	if category != "" {
		tags, err = h.queries.ListHotTagsByCategory(c.Request().Context(), category)
	} else {
		tags, err = h.queries.ListHotTags(c.Request().Context())
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list tags")
	}
	return c.JSON(http.StatusOK, tags)
}

func (h *handler) handleResolveAniList(c *echo.Context) error {
	anilistID, err := strconv.Atoi(c.QueryParam("anilist_id"))
	if err != nil || anilistID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "anilist_id parameter required")
	}
	bangumiID, err := h.metadata.ResolveBangumiID(c.Request().Context(), anilistID)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, map[string]int{"bangumi_id": bangumiID})
}

func (h *handler) handleAnimeEpisodes(c *echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	refresh := c.QueryParam("refresh") == "true"
	ctx := c.Request().Context()
	eps, err := h.metadata.GetEpisodes(ctx, id, refresh)
	if err != nil {
		return mapMetadataError(err)
	}
	h.enrichEpisodesWithTMDB(ctx, eps, id, h.preferredLocale(c), refresh)
	return c.JSON(http.StatusOK, eps)
}

func (h *handler) handleAnimeComments(c *echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	comments, err := h.metadata.GetComments(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, comments)
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
