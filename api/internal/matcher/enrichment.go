package matcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/store"
)

const tmdbImageBase = "https://image.tmdb.org/t/p/w300"

// EnrichEpisodesFromTMDB fetches Chinese synopses from TMDB and updates episode records.
func EnrichEpisodesFromTMDB(ctx context.Context, q *store.Queries, tmdbClient tmdb.Client, c cache.Cache, libraryID string) (int, error) {
	if tmdbClient == nil {
		return 0, nil
	}

	animeList, err := q.ListAnimeByLibrary(ctx, sql.NullString{String: libraryID, Valid: true})
	if err != nil {
		return 0, err
	}

	enriched := 0
	for _, anime := range animeList {
		tmdbID := int(anime.TmdbID.Int64)

		// If no TMDB ID, try to find it by title search
		if !anime.TmdbID.Valid || anime.TmdbID.Int64 == 0 {
			searchTitle := anime.TitleZh.String
			if searchTitle == "" {
				searchTitle = anime.Title
			}
			shows, searchErr := tmdbClient.SearchTV(ctx, searchTitle, "zh-CN")
			if searchErr != nil || len(shows) == 0 {
				continue
			}
			tmdbID = shows[0].ID
			if err := q.UpdateAnimeTMDBID(ctx, store.UpdateAnimeTMDBIDParams{
				TmdbID: sql.NullInt64{Int64: int64(tmdbID), Valid: true},
				ID:     anime.ID,
			}); err != nil {
				slog.Warn("enrichment: update anime TMDB ID failed", "err", err)
			}
		}

		// Fetch season 1 episodes with Chinese language (cached)
		cacheKey := fmt.Sprintf("tmdb:season:%d:1:zh-CN", tmdbID)
		var season *tmdb.Season

		if data, cacheErr := c.Get(ctx, cacheKey); cacheErr == nil {
			var cached tmdb.Season
			if json.Unmarshal(data, &cached) == nil {
				season = &cached
			}
		}

		if season == nil {
			fetched, fetchErr := tmdbClient.GetTVSeason(ctx, tmdbID, 1, "zh-CN")
			if fetchErr != nil {
				continue
			}
			season = fetched
			if data, marshalErr := json.Marshal(season); marshalErr == nil {
				_ = c.Set(ctx, cacheKey, data, 24*time.Hour)
			}
		}

		// Update episodes with Chinese metadata
		episodes, _ := q.ListEpisodesByAnimeID(ctx, anime.ID)
		for _, ep := range episodes {
			for _, tmdbEp := range season.Episodes {
				if int(ep.EpisodeNumber) == tmdbEp.EpisodeNumber {
					thumbnailURL := ""
					if tmdbEp.StillPath != "" {
						thumbnailURL = tmdbImageBase + tmdbEp.StillPath
					}
					// UpdateEpisodeTMDBMetadataParams uses NULLIF, NULLIF_2, NULLIF_3 for
					// synopsis_zh, title_zh, thumbnail_url respectively (sqlc-generated names).
					updateErr := q.UpdateEpisodeTMDBMetadata(ctx, store.UpdateEpisodeTMDBMetadataParams{
						NULLIF:   tmdbEp.Overview,
						NULLIF_2: tmdbEp.Name,
						NULLIF_3: thumbnailURL,
						ID:       ep.ID,
					})
					if updateErr == nil {
						enriched++
					}
					break
				}
			}
		}
	}

	return enriched, nil
}
