package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type playableEpisodeMedia struct {
	ID        string  `json:"id"`
	Filename  string  `json:"filename"`
	SizeBytes *int64  `json:"size_bytes"`
	Width     *int64  `json:"width"`
	Height    *int64  `json:"height"`
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
	WatchStatus string                    `json:"watch_status"`
	Episodes    []playableEpisodeResponse `json:"episodes"`
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
				ID:        row.MediaFileID.String,
				Filename:  row.MediaFilename.String,
				SizeBytes: nullInt(row.MediaSizeBytes),
				Width:     nullInt(row.MediaWidth),
				Height:    nullInt(row.MediaHeight),
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
		WatchStatus: anime.WatchStatus,
		Episodes:    episodes,
	})
}
