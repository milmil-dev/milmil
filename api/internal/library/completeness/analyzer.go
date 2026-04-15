package completeness

import (
	"context"
	"database/sql"
	"math"
	"time"

	"github.com/milmil/api/internal/store"
)

// BuildReport computes the missing-episode state for a single anime.
func BuildReport(ctx context.Context, q *store.Queries, animeID string) (Report, error) {
	anime, err := q.GetAnime(ctx, animeID)
	if err != nil {
		return Report{}, err
	}
	now := time.Now().UTC()

	rep := Report{
		AnimeID:       animeID,
		Title:         anime.Title,
		Have:          make([]int, 0),
		Missing:       make([]int, 0),
		AiringPending: make([]int, 0),
		GeneratedAt:   now,
	}
	if anime.BangumiID.Valid {
		rep.BangumiID = anime.BangumiID.Int64
	}
	if !anime.TotalEpisodes.Valid || anime.TotalEpisodes.Int64 == 0 {
		rep.UnknownTotal = true
		return rep, nil
	}
	total := int(anime.TotalEpisodes.Int64)
	rep.Total = total

	episodes, err := q.ListEpisodesByAnimeIDWithAirDate(ctx, animeID)
	if err != nil {
		return Report{}, err
	}
	fileRows, err := q.CountMediaFilesPerEpisodeByAnime(ctx, animeID)
	if err != nil {
		return Report{}, err
	}

	have := make(map[int]bool, len(fileRows))
	for _, row := range fileRows {
		if row.FileCount == 0 {
			continue
		}
		if row.EpisodeNumber != math.Trunc(row.EpisodeNumber) {
			continue
		}
		have[int(row.EpisodeNumber)] = true
	}

	airDate := make(map[int]time.Time, len(episodes))
	for _, ep := range episodes {
		if ep.EpisodeNumber != math.Trunc(ep.EpisodeNumber) {
			continue
		}
		n := int(ep.EpisodeNumber)
		if ep.AirDate.Valid && ep.AirDate.String != "" {
			if t, perr := time.Parse("2006-01-02", ep.AirDate.String); perr == nil {
				airDate[n] = t
			}
		}
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	for n := 1; n <= total; n++ {
		if have[n] {
			rep.Have = append(rep.Have, n)
			continue
		}
		if t, ok := airDate[n]; ok && t.After(today) {
			rep.AiringPending = append(rep.AiringPending, n)
			continue
		}
		rep.Missing = append(rep.Missing, n)
	}
	return rep, nil
}

// BuildLibrarySummary computes completeness reports for every anime in a
// library using exactly three queries (anime list, episodes, file counts).
func BuildLibrarySummary(ctx context.Context, q *store.Queries, libraryID string) ([]Report, error) {
	libArg := sql.NullString{String: libraryID, Valid: libraryID != ""}

	animes, err := q.ListAnimeByLibraryID(ctx, libArg)
	if err != nil {
		return nil, err
	}
	episodes, err := q.ListEpisodesByLibraryIDWithAirDate(ctx, libArg)
	if err != nil {
		return nil, err
	}
	fileRows, err := q.CountMediaFilesPerEpisodeByLibrary(ctx, libArg)
	if err != nil {
		return nil, err
	}

	type epMeta struct {
		airDate time.Time
		hasDate bool
	}
	episodesByAnime := make(map[string]map[int]epMeta)
	for _, e := range episodes {
		if e.EpisodeNumber != math.Trunc(e.EpisodeNumber) {
			continue
		}
		m := episodesByAnime[e.AnimeID]
		if m == nil {
			m = make(map[int]epMeta)
			episodesByAnime[e.AnimeID] = m
		}
		em := epMeta{}
		if e.AirDate.Valid && e.AirDate.String != "" {
			if t, perr := time.Parse("2006-01-02", e.AirDate.String); perr == nil {
				em.airDate = t
				em.hasDate = true
			}
		}
		m[int(e.EpisodeNumber)] = em
	}

	haveByAnime := make(map[string]map[int]bool)
	for _, row := range fileRows {
		if row.FileCount == 0 {
			continue
		}
		if row.EpisodeNumber != math.Trunc(row.EpisodeNumber) {
			continue
		}
		m := haveByAnime[row.AnimeID]
		if m == nil {
			m = make(map[int]bool)
			haveByAnime[row.AnimeID] = m
		}
		m[int(row.EpisodeNumber)] = true
	}

	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	reports := make([]Report, 0, len(animes))
	for _, a := range animes {
		rep := Report{
			AnimeID:       a.ID,
			Title:         a.Title,
			Have:          make([]int, 0),
			Missing:       make([]int, 0),
			AiringPending: make([]int, 0),
			GeneratedAt:   now,
		}
		if a.BangumiID.Valid {
			rep.BangumiID = a.BangumiID.Int64
		}
		if !a.TotalEpisodes.Valid || a.TotalEpisodes.Int64 == 0 {
			rep.UnknownTotal = true
			reports = append(reports, rep)
			continue
		}
		total := int(a.TotalEpisodes.Int64)
		rep.Total = total
		have := haveByAnime[a.ID]
		eps := episodesByAnime[a.ID]
		for n := 1; n <= total; n++ {
			if have[n] {
				rep.Have = append(rep.Have, n)
				continue
			}
			if em, ok := eps[n]; ok && em.hasDate && em.airDate.After(today) {
				rep.AiringPending = append(rep.AiringPending, n)
				continue
			}
			rep.Missing = append(rep.Missing, n)
		}
		reports = append(reports, rep)
	}
	return reports, nil
}
