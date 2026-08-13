package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

type watchURLResponse struct {
	AnimeID     string `json:"anime_id"`
	EpisodeID   string `json:"episode_id"`
	WatchURL    string `json:"watch_url"`
	StreamURL   string `json:"stream_url"`
	MatchedFile string `json:"matched_file"`
}

// handleEpisodeWatchURL returns the canonical web watch URL and direct stream
// URL for the preferred matched media file of an episode.
//
// 404 if the episode does not exist or has no matched media file.
func (h *handler) handleEpisodeWatchURL(c *echo.Context) error {
	episodeID := c.Param("id")
	ep, err := h.queries.GetEpisode(c.Request().Context(), episodeID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "episode not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	files, err := h.queries.ListMediaFilesByEpisode(c.Request().Context(), sql.NullString{String: episodeID, Valid: true})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if len(files) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "no matched file for this episode")
	}
	preferred := pickPreferredFile(files, ep.PreferredMediaFileID)

	webBase := h.cfg.PublicWebURL
	apiBase := h.cfg.PublicAPIURL
	if apiBase == "" {
		apiBase = webBase
	}
	return c.JSON(http.StatusOK, watchURLResponse{
		AnimeID:     ep.AnimeID,
		EpisodeID:   episodeID,
		WatchURL:    fmt.Sprintf("%s/watch/%s/%s", webBase, ep.AnimeID, episodeID),
		StreamURL:   fmt.Sprintf("%s/api/v1/stream/%s/direct", apiBase, preferred.ID),
		MatchedFile: preferred.Path,
	})
}

// pickPreferredFile picks the user-preferred file when set, otherwise the
// largest by size as a stand-in for "highest quality".
func pickPreferredFile(files []store.MediaFile, preferredID sql.NullString) store.MediaFile {
	if preferredID.Valid && preferredID.String != "" {
		for _, f := range files {
			if f.ID == preferredID.String {
				return f
			}
		}
	}
	best := files[0]
	for _, f := range files[1:] {
		if f.SizeBytes > best.SizeBytes {
			best = f
		}
	}
	return best
}
