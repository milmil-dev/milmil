package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type saveProgressRequest struct {
	MediaFileID     string `json:"media_file_id"`
	EpisodeID       string `json:"episode_id"`
	PositionSeconds int64  `json:"position_seconds"`
	DurationSeconds int64  `json:"duration_seconds"`
	Completed       bool   `json:"completed"`
}

type progressResponse struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	EpisodeID       string  `json:"episode_id"`
	MediaFileID     *string `json:"media_file_id"`
	PositionSeconds int64   `json:"position_seconds"`
	DurationSeconds *int64  `json:"duration_seconds"`
	Completed       int64   `json:"completed"`
	LastWatchedAt   string  `json:"last_watched_at"`
}

func toProgressResponse(p store.WatchProgress) progressResponse {
	return progressResponse{
		ID:              p.ID,
		UserID:          p.UserID,
		EpisodeID:       p.EpisodeID,
		MediaFileID:     nullStr(p.MediaFileID),
		PositionSeconds: p.PositionSeconds,
		DurationSeconds: nullInt(p.DurationSeconds),
		Completed:       p.Completed,
		LastWatchedAt:   p.LastWatchedAt,
	}
}

func (h *handler) handleSaveProgress(c echo.Context) error {
	var req saveProgressRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.EpisodeID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "episode_id is required")
	}

	userID := getUserID(c)

	var completedInt int64
	if req.Completed {
		completedInt = 1
	}

	progress, err := h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:        uuid.New().String(),
		UserID:    userID,
		EpisodeID: req.EpisodeID,
		MediaFileID: sql.NullString{
			String: req.MediaFileID,
			Valid:  req.MediaFileID != "",
		},
		PositionSeconds: req.PositionSeconds,
		DurationSeconds: sql.NullInt64{
			Int64: req.DurationSeconds,
			Valid: req.DurationSeconds > 0,
		},
		Completed: completedInt,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// A1 fix: synchronous enqueue so a crash between DB write and queue insert
	// cannot lose the sync op. The enqueue is a fast transactional INSERT (<5ms).
	if h.syncSvc != nil {
		episode, epErr := h.queries.GetEpisode(c.Request().Context(), req.EpisodeID)
		if epErr == nil {
			h.syncSvc.OnProgressUpdate(c.Request().Context(), userID, episode.AnimeID)
		}
	}

	return c.JSON(http.StatusOK, toProgressResponse(progress))
}

type enrichedProgressResponse struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	EpisodeID       string  `json:"episode_id"`
	MediaFileID     *string `json:"media_file_id"`
	PositionSeconds int64   `json:"position_seconds"`
	DurationSeconds *int64  `json:"duration_seconds"`
	Completed       int64   `json:"completed"`
	LastWatchedAt   string  `json:"last_watched_at"`
	AnimeID         string  `json:"anime_id"`
	AnimeTitle      string  `json:"anime_title"`
	AnimeTitleZh    *string `json:"anime_title_zh"`
	AnimeCoverImage *string `json:"anime_cover_image"`
	AnimeBangumiID  *int64  `json:"anime_bangumi_id"`
	EpisodeNumber   float64 `json:"episode_number"`
}

func (h *handler) handleListRecentProgress(c echo.Context) error {
	userID := getUserID(c)

	items, err := h.queries.ListRecentProgressWithAnime(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	result := make([]enrichedProgressResponse, len(items))
	for i, item := range items {
		result[i] = enrichedProgressResponse{
			ID:              item.ID,
			UserID:          item.UserID,
			EpisodeID:       item.EpisodeID,
			MediaFileID:     nullStr(item.MediaFileID),
			PositionSeconds: item.PositionSeconds,
			DurationSeconds: nullInt(item.DurationSeconds),
			Completed:       item.Completed,
			LastWatchedAt:   item.LastWatchedAt,
			AnimeID:         item.AnimeID,
			AnimeTitle:      item.AnimeTitle,
			AnimeTitleZh:    nullStr(item.AnimeTitleZh),
			AnimeCoverImage: nullStr(item.AnimeCoverImageUrl),
			AnimeBangumiID:  nullInt(item.AnimeBangumiID),
			EpisodeNumber:   item.EpisodeNumber,
		}
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleGetProgressByFile(c echo.Context) error {
	userID := getUserID(c)
	fileID := c.Param("fileId")

	progress, err := h.queries.GetWatchProgressByMediaFile(c.Request().Context(), store.GetWatchProgressByMediaFileParams{
		UserID: userID,
		MediaFileID: sql.NullString{
			String: fileID,
			Valid:  fileID != "",
		},
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "no progress found")
		}
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, toProgressResponse(progress))
}

type listHistoryResponse struct {
	Items      []enrichedProgressResponse `json:"items"`
	NextBefore *string                    `json:"next_before"`
}

func (h *handler) handleListHistory(c echo.Context) error {
	userID := getUserID(c)

	filter := c.QueryParam("filter")
	if filter == "" {
		filter = "all"
	}
	switch filter {
	case "all", "in_progress", "completed":
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filter; must be one of all, in_progress, completed")
	}

	before := c.QueryParam("before")
	q := c.QueryParam("q")

	limit := int64(40)
	if s := c.QueryParam("limit"); s != "" {
		if n, err := strconv.ParseInt(s, 10, 64); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 100 {
		limit = 100
	}

	// Fetch limit+1 to determine whether there's a next page.
	rows, err := h.queries.ListHistoryWithAnime(c.Request().Context(), store.ListHistoryWithAnimeParams{
		UserID: userID,
		Before: before,
		Filter: filter,
		Q:      q,
		Lim:    limit + 1,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	hasMore := int64(len(rows)) > limit
	if hasMore {
		rows = rows[:limit]
	}

	items := make([]enrichedProgressResponse, len(rows))
	for i, item := range rows {
		items[i] = enrichedProgressResponse{
			ID:              item.ID,
			UserID:          item.UserID,
			EpisodeID:       item.EpisodeID,
			MediaFileID:     nullStr(item.MediaFileID),
			PositionSeconds: item.PositionSeconds,
			DurationSeconds: nullInt(item.DurationSeconds),
			Completed:       item.Completed,
			LastWatchedAt:   item.LastWatchedAt,
			AnimeID:         item.AnimeID,
			AnimeTitle:      item.AnimeTitle,
			AnimeTitleZh:    nullStr(item.AnimeTitleZh),
			AnimeCoverImage: nullStr(item.AnimeCoverImageUrl),
			AnimeBangumiID:  nullInt(item.AnimeBangumiID),
			EpisodeNumber:   item.EpisodeNumber,
		}
	}

	resp := listHistoryResponse{Items: items}
	if hasMore && len(items) > 0 {
		next := items[len(items)-1].LastWatchedAt
		resp.NextBefore = &next
	}

	return c.JSON(http.StatusOK, resp)
}
