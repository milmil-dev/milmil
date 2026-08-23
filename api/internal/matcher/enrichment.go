package matcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
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
			shows, ok := searchTVWithLanguageFallback(ctx, tmdbClient, searchTitle, tmdbLanguagesForSettings(ctx, q))
			if !ok {
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

		season, ok := getSeasonWithLanguageFallback(ctx, tmdbClient, c, tmdbID, 1, tmdbLanguagesForSettings(ctx, q))
		if !ok {
			continue
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

func searchTVWithLanguageFallback(ctx context.Context, tmdbClient tmdb.Client, title string, languages []string) ([]tmdb.TVShow, bool) {
	var firstErr error
	for _, language := range languages {
		shows, err := tmdbClient.SearchTV(ctx, title, language)
		if err == nil && len(shows) > 0 {
			return shows, true
		}
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		slog.Warn("matcher: TMDB search failed for all languages", "title", title, "languages", languages, "err", firstErr)
	}
	return nil, false
}

func getSeasonWithLanguageFallback(ctx context.Context, tmdbClient tmdb.Client, c cache.Cache, tmdbID int, seasonNumber int, languages []string) (*tmdb.Season, bool) {
	var firstErr error
	for _, language := range languages {
		cacheKey := fmt.Sprintf("tmdb:season:%d:%d:%s", tmdbID, seasonNumber, language)
		if data, cacheErr := c.Get(ctx, cacheKey); cacheErr == nil {
			var cached tmdb.Season
			if json.Unmarshal(data, &cached) == nil && len(cached.Episodes) > 0 {
				return &cached, true
			}
		}

		fetched, fetchErr := tmdbClient.GetTVSeason(ctx, tmdbID, seasonNumber, language)
		if fetchErr != nil {
			if firstErr == nil {
				firstErr = fetchErr
			}
			continue
		}
		if fetched == nil || len(fetched.Episodes) == 0 {
			continue
		}
		if data, marshalErr := json.Marshal(fetched); marshalErr == nil {
			_ = c.Set(ctx, cacheKey, data, 24*time.Hour)
		}
		return fetched, true
	}
	if firstErr != nil {
		slog.Warn("matcher: TMDB season fetch failed for all languages", "tmdb_id", tmdbID, "season", seasonNumber, "languages", languages, "err", firstErr)
	}
	return nil, false
}

func tmdbLanguagesForSettings(ctx context.Context, q *store.Queries) []string {
	if q == nil {
		return tmdbLanguagesForLocale("")
	}
	setting, err := q.GetSetting(ctx, "appearance")
	if err != nil {
		return tmdbLanguagesForLocale("")
	}
	var appearance struct {
		Language string `json:"language"`
	}
	if json.Unmarshal([]byte(setting.Value), &appearance) != nil {
		return tmdbLanguagesForLocale("")
	}
	return tmdbLanguagesForLocale(appearance.Language)
}

func tmdbLanguagesForLocale(locale string) []string {
	switch strings.ToLower(strings.TrimSpace(locale)) {
	case "zh-tw", "zh-hant":
		return []string{"zh-TW", "zh-HK", "zh-CN"}
	case "zh-cn", "zh-hans":
		return []string{"zh-CN", "zh-TW", "zh-HK"}
	case "zh-hk":
		return []string{"zh-HK", "zh-TW", "zh-CN"}
	case "en", "en-us", "en-gb":
		return []string{"en-US", "zh-TW", "zh-CN"}
	case "ja", "ja-jp":
		return []string{"ja-JP", "zh-TW", "zh-CN"}
	case "ko", "ko-kr":
		return []string{"ko-KR", "zh-TW", "zh-CN"}
	default:
		return []string{"zh-TW", "zh-HK", "zh-CN"}
	}
}
