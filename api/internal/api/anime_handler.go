package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type playableEpisodeMedia struct {
	ID         string  `json:"id"`
	Filename   string  `json:"filename"`
	SizeBytes  *int64  `json:"size_bytes"`
	Width      *int64  `json:"width"`
	Height     *int64  `json:"height"`
	VideoCodec *string `json:"video_codec,omitempty"`
	AudioCodec *string `json:"audio_codec,omitempty"`
}

type playableEpisodeProgress struct {
	PositionSeconds  int64 `json:"position_seconds"`
	DurationSeconds  int64 `json:"duration_seconds"`
	Completed        bool  `json:"completed"`
}

type playableEpisodeResponse struct {
	EpisodeID  string                   `json:"episode_id"`
	Sort       float64                  `json:"sort"`
	Title      *string                  `json:"title"`
	TitleZh    *string                  `json:"title_zh"`
	AirDate    *string                  `json:"air_date"`
	Synopsis   *string                  `json:"synopsis"`
	SynopsisZh *string                  `json:"synopsis_zh"`
	Image      *string                  `json:"image"`
	MediaFile  *playableEpisodeMedia    `json:"media_file"`
	Progress   *playableEpisodeProgress `json:"progress"`
}

type playableEpisodesEnvelope struct {
	AnimeID             string                    `json:"anime_id"`
	WatchStatus         string                    `json:"watch_status"`
	MalID               *int64                    `json:"mal_id"`
	TmdbID              *int64                    `json:"tmdb_id"`
	AnidbID             *int64                    `json:"anidb_id"`
	UserScore           *int64                    `json:"user_score"`
	SyncDisabled        int64                     `json:"sync_disabled"`
	WatchStatusOverride string                    `json:"watch_status_override"`
	Episodes            []playableEpisodeResponse `json:"episodes"`
}

func (h *handler) handlePlayableEpisodes(c echo.Context) error {
	bangumiIDStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(bangumiIDStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	ctx := c.Request().Context()

	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if err == sql.ErrNoRows {
			return echo.NewHTTPError(http.StatusNotFound, "anime not found")
		}
		return echo.ErrInternalServerError
	}

	rows, err := h.queries.ListPlayableEpisodes(ctx, anime.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	episodes := make([]playableEpisodeResponse, len(rows))
	for i, row := range rows {
		ep := playableEpisodeResponse{
			EpisodeID:  row.EpisodeID,
			Sort:       row.Sort,
			Title:      nullStr(row.EpisodeTitle),
			TitleZh:    nullStr(row.EpisodeTitleZh),
			AirDate:    nullStr(row.AirDate),
			Synopsis:   nullStr(row.Synopsis),
			SynopsisZh: nullStr(row.SynopsisZh),
			Image:      nullStr(row.Image),
		}

		if row.MediaFileID.Valid {
			ep.MediaFile = &playableEpisodeMedia{
				ID:         row.MediaFileID.String,
				Filename:   row.MediaFilename.String,
				SizeBytes:  nullInt(row.MediaSizeBytes),
				Width:      nullInt(row.MediaWidth),
				Height:     nullInt(row.MediaHeight),
				VideoCodec: nullStr(row.MediaVideoCodec),
				AudioCodec: nullStr(row.MediaAudioCodec),
			}
		}

		if row.PositionSeconds.Valid {
			ep.Progress = &playableEpisodeProgress{
				PositionSeconds: row.PositionSeconds.Int64,
				DurationSeconds: row.ProgressDuration.Int64,
				Completed:       row.Completed.Int64 == 1,
			}
		}

		episodes[i] = ep
	}

	return c.JSON(http.StatusOK, playableEpisodesEnvelope{
		AnimeID:             anime.ID,
		WatchStatus:         anime.WatchStatus,
		MalID:               nullInt(anime.MalID),
		TmdbID:              nullInt(anime.TmdbID),
		AnidbID:             nullInt(anime.AnidbID),
		UserScore:           nullInt(anime.UserScore),
		SyncDisabled:        anime.SyncDisabled,
		WatchStatusOverride: anime.WatchStatusOverride,
		Episodes:            episodes,
	})
}

// PATCH /api/v1/anime/:bangumiId/sync-flags
//
// Updates per-anime tracker sync flags. Accepts any combination of:
//   - sync_disabled (0|1) — when 1, the anime is skipped by outgoing sync ops
//   - watch_status_override (string) — pins a specific canonical watch status
//
// Fields omitted from the request body retain their current value.
func (h *handler) handleUpdateAnimeSyncFlags(c echo.Context) error {
	bangumiIDStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(bangumiIDStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	var body struct {
		SyncDisabled        *int    `json:"sync_disabled"`
		WatchStatusOverride *string `json:"watch_status_override"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	ctx := c.Request().Context()
	current, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if err == sql.ErrNoRows {
			return echo.NewHTTPError(http.StatusNotFound, "anime not found")
		}
		return echo.ErrInternalServerError
	}

	params := store.UpdateAnimeSyncFlagsParams{
		ID:                  current.ID,
		SyncDisabled:        current.SyncDisabled,
		WatchStatusOverride: current.WatchStatusOverride,
	}
	if body.SyncDisabled != nil {
		params.SyncDisabled = int64(*body.SyncDisabled)
	}
	if body.WatchStatusOverride != nil {
		params.WatchStatusOverride = *body.WatchStatusOverride
	}

	if err := h.queries.UpdateAnimeSyncFlags(ctx, params); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleUpdateScore(c echo.Context) error {
	bangumiIDStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(bangumiIDStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	var body struct {
		Score *int64 `json:"score"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	ctx := c.Request().Context()
	err = h.queries.UpdateAnimeUserScore(ctx, store.UpdateAnimeUserScoreParams{
		UserScore: sql.NullInt64{Int64: derefInt64(body.Score), Valid: body.Score != nil},
		BangumiID: sql.NullInt64{Int64: bangumiID, Valid: true},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func derefInt64(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
