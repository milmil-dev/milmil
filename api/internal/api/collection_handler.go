package api

import (
	"database/sql"
	"net/http"
	"sort"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type collectionAnimeResponse struct {
	ID                   string  `json:"id"`
	BangumiID            *int64  `json:"bangumi_id"`
	Title                string  `json:"title"`
	TitleZh              *string `json:"title_zh"`
	TitleEn              *string `json:"title_en"`
	CoverImageUrl        *string `json:"cover_image_url"`
	TotalEpisodes        *int64  `json:"total_episodes"`
	Status               string  `json:"status"`
	WatchStatus          string  `json:"watch_status"`
	WatchStatusUpdatedAt *string `json:"watch_status_updated_at"`
	Genres               string  `json:"genres"`
	Year                 *int64  `json:"year"`
	Season               *string `json:"season"`
	AirDate              *string `json:"air_date"`
	CreatedAt            string  `json:"created_at"`
	LocalFileCount       int64   `json:"local_file_count"`
}

func nullStr(s sql.NullString) *string {
	if s.Valid {
		return &s.String
	}
	return nil
}

func nullInt(n sql.NullInt64) *int64 {
	if n.Valid {
		return &n.Int64
	}
	return nil
}

func toCollectionAnime(row store.ListCollectionAnimeRow) collectionAnimeResponse {
	return collectionAnimeResponse{
		ID:                   row.ID,
		BangumiID:            nullInt(row.BangumiID),
		Title:                row.Title,
		TitleZh:              nullStr(row.TitleZh),
		TitleEn:              nullStr(row.TitleEn),
		CoverImageUrl:        nullStr(row.CoverImageUrl),
		TotalEpisodes:        nullInt(row.TotalEpisodes),
		Status:               row.Status,
		WatchStatus:          row.WatchStatus,
		WatchStatusUpdatedAt: nullStr(row.WatchStatusUpdatedAt),
		Genres:               row.Genres,
		Year:                 nullInt(row.Year),
		Season:               nullStr(row.Season),
		AirDate:              nullStr(row.AirDate),
		CreatedAt:            row.CreatedAt,
		LocalFileCount:       row.LocalFileCount,
	}
}

type recentAnimeResponse struct {
	ID             string  `json:"id"`
	BangumiID      *int64  `json:"bangumi_id"`
	Title          string  `json:"title"`
	TitleZh        *string `json:"title_zh"`
	CoverImageUrl  *string `json:"cover_image_url"`
	TotalEpisodes  *int64  `json:"total_episodes"`
	WatchStatus    string  `json:"watch_status"`
	LocalFileCount int64   `json:"local_file_count"`
}

func toRecentAnime(row store.ListRecentlyMatchedAnimeRow) recentAnimeResponse {
	return recentAnimeResponse{
		ID:             row.ID,
		BangumiID:      nullInt(row.BangumiID),
		Title:          row.Title,
		TitleZh:        nullStr(row.TitleZh),
		CoverImageUrl:  nullStr(row.CoverImageUrl),
		TotalEpisodes:  nullInt(row.TotalEpisodes),
		WatchStatus:    row.WatchStatus,
		LocalFileCount: row.LocalFileCount,
	}
}

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

	result := make([]collectionAnimeResponse, len(items))
	for i, item := range items {
		result[i] = toCollectionAnime(item)
	}

	if sortBy == "name" {
		sort.Slice(result, func(i, j int) bool {
			return result[i].Title < result[j].Title
		})
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleListRecentCollection(c echo.Context) error {
	items, err := h.queries.ListRecentlyMatchedAnime(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}

	result := make([]recentAnimeResponse, len(items))
	for i, item := range items {
		result[i] = toRecentAnime(item)
	}

	return c.JSON(http.StatusOK, result)
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
