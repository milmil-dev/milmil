package matcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher/fileparse"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
)

type MatchSummary struct {
	Matched      int `json:"matched"`
	Unmatched    int `json:"unmatched"`
	Errors       int `json:"errors"`
	ByDandanplay int `json:"by_dandanplay"`
	ByBangumi    int `json:"by_bangumi"`
	ByTMDB       int `json:"by_tmdb"`
}

type Matcher struct {
	queries    *store.Queries
	dandanplay dandanplay.Client
	bangumi    bangumi.Client
	tmdb       tmdb.Client
	cache      cache.Cache
}

// New creates a matcher with only dandanplay support (backward compatible).
func New(q *store.Queries, ddp dandanplay.Client, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, cache: c}
}

// NewMulti creates a matcher with all three strategy providers.
func NewMulti(q *store.Queries, ddp dandanplay.Client, bgm bangumi.Client, tmdbClient tmdb.Client, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, bangumi: bgm, tmdb: tmdbClient, cache: c}
}

func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string, onProgress ...scanner.ProgressFunc) (*MatchSummary, error) {
	files, err := m.queries.ListAllUnmatchedMediaFilesByLibrary(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	emit := func(e scanner.ProgressEvent) {
		if len(onProgress) > 0 && onProgress[0] != nil {
			onProgress[0](e)
		}
	}

	summary := &MatchSummary{}
	total := len(files)

	// Track which files are still unmatched after each pass.
	matched := make(map[string]bool, total)
	processed := 0

	// --- Pass 1: dandanplay hash matching ---
	for _, f := range files {
		if !f.FileHash.Valid || f.FileHash.String == "" {
			continue
		}

		episodeID, animeID, ok, matchErr := m.matchDandanplay(ctx, f)
		if matchErr != nil {
			summary.Errors++
			continue
		}
		if ok {
			summary.Matched++
			summary.ByDandanplay++
			matched[f.ID] = true
			_ = m.queries.UpdateMediaFileDandanplayIDs(ctx, store.UpdateMediaFileDandanplayIDsParams{
				DandanplayEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
				DandanplayAnimeID:   sql.NullInt64{Int64: animeID, Valid: true},
				ID:                  f.ID,
			})
		}

		processed++
		emit(scanner.ProgressEvent{
			Type:         "match:progress",
			LibraryID:    libraryID,
			FilesMatched: summary.Matched,
			FilesTotal:   total,
			CurrentFile:  f.Filename,
		})
	}

	// --- Pass 2: Bangumi title search ---
	if m.bangumi != nil {
		for _, f := range files {
			if matched[f.ID] {
				continue
			}

			parsed := fileparse.Parse(f.Filename)
			if parsed.Title == "" || parsed.EpisodeNumber == 0 {
				continue
			}

			subjectID, episodeID, ok, matchErr := m.matchBangumi(ctx, parsed)
			if matchErr != nil {
				summary.Errors++
				continue
			}
			if ok {
				summary.Matched++
				summary.ByBangumi++
				matched[f.ID] = true
				_ = m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{
					BangumiSubjectID: sql.NullInt64{Int64: int64(subjectID), Valid: true},
					BangumiEpisodeID: sql.NullInt64{Int64: int64(episodeID), Valid: true},
					ID:               f.ID,
				})
			}

			processed++
			emit(scanner.ProgressEvent{
				Type:         "match:progress",
				LibraryID:    libraryID,
				FilesMatched: summary.Matched,
				FilesTotal:   total,
				CurrentFile:  f.Filename,
			})
		}
	}

	// --- Pass 3: TMDB search → cross-ref Bangumi ---
	if m.tmdb != nil && m.bangumi != nil {
		for _, f := range files {
			if matched[f.ID] {
				continue
			}

			parsed := fileparse.Parse(f.Filename)
			if parsed.Title == "" || parsed.EpisodeNumber == 0 {
				continue
			}

			subjectID, episodeID, ok, matchErr := m.matchTMDB(ctx, parsed)
			if matchErr != nil {
				summary.Errors++
				continue
			}
			if ok {
				summary.Matched++
				summary.ByTMDB++
				matched[f.ID] = true
				_ = m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{
					BangumiSubjectID: sql.NullInt64{Int64: int64(subjectID), Valid: true},
					BangumiEpisodeID: sql.NullInt64{Int64: int64(episodeID), Valid: true},
					ID:               f.ID,
				})
			}

			processed++
			emit(scanner.ProgressEvent{
				Type:         "match:progress",
				LibraryID:    libraryID,
				FilesMatched: summary.Matched,
				FilesTotal:   total,
				CurrentFile:  f.Filename,
			})
		}
	}

	// Count remaining unmatched.
	for _, f := range files {
		if !matched[f.ID] {
			summary.Unmatched++
		}
	}

	return summary, nil
}

// matchDandanplay tries to match a file by its hash via dandanplay API.
func (m *Matcher) matchDandanplay(ctx context.Context, f store.MediaFile) (episodeID int64, animeID int64, ok bool, err error) {
	cacheKey := fmt.Sprintf("danmaku:match:%s", f.FileHash.String)

	if data, cacheErr := m.cache.Get(ctx, cacheKey); cacheErr == nil {
		var cached [2]int64
		if json.Unmarshal(data, &cached) == nil && cached[0] > 0 {
			return cached[0], cached[1], true, nil
		}
	}

	duration := 0
	if f.DurationSeconds.Valid {
		duration = int(f.DurationSeconds.Int64)
	}

	result, err := m.dandanplay.MatchFile(ctx, f.Filename, f.FileHash.String, f.SizeBytes, duration)
	if err != nil {
		return 0, 0, false, err
	}

	if !result.IsMatched || len(result.Matches) == 0 {
		return 0, 0, false, nil
	}

	episodeID = result.Matches[0].EpisodeID
	animeID = result.Matches[0].AnimeID

	if data, marshalErr := json.Marshal([2]int64{episodeID, animeID}); marshalErr == nil {
		_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}

	return episodeID, animeID, true, nil
}

// matchBangumi searches Bangumi by parsed title and matches the episode by Sort field.
func (m *Matcher) matchBangumi(ctx context.Context, parsed fileparse.ParsedFilename) (subjectID int, episodeID int, ok bool, err error) {
	cacheKey := fmt.Sprintf("bgm:search:%s", parsed.Title)

	// Try cache for subject search
	var subjects []bangumi.Subject
	if data, cacheErr := m.cache.Get(ctx, cacheKey); cacheErr == nil {
		_ = json.Unmarshal(data, &subjects)
	}

	if len(subjects) == 0 {
		subjects, err = m.bangumi.SearchSubjects(ctx, parsed.Title)
		if err != nil {
			return 0, 0, false, err
		}
		if len(subjects) == 0 {
			return 0, 0, false, nil
		}
		if data, marshalErr := json.Marshal(subjects); marshalErr == nil {
			_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
		}
	}

	subject := subjects[0]

	epCacheKey := fmt.Sprintf("bgm:episodes:%d", subject.ID)
	var episodes []bangumi.Episode
	if data, cacheErr := m.cache.Get(ctx, epCacheKey); cacheErr == nil {
		_ = json.Unmarshal(data, &episodes)
	}

	if len(episodes) == 0 {
		episodes, err = m.bangumi.GetSubjectEpisodes(ctx, subject.ID)
		if err != nil {
			return 0, 0, false, err
		}
		if data, marshalErr := json.Marshal(episodes); marshalErr == nil {
			_ = m.cache.Set(ctx, epCacheKey, data, 7*24*time.Hour)
		}
	}

	for _, ep := range episodes {
		if int(ep.Sort) == parsed.EpisodeNumber {
			return subject.ID, ep.ID, true, nil
		}
	}

	return 0, 0, false, nil
}

// matchTMDB searches TMDB by parsed title (zh-CN), then cross-references to Bangumi
// by searching the show's OriginalName (or Name as fallback).
func (m *Matcher) matchTMDB(ctx context.Context, parsed fileparse.ParsedFilename) (subjectID int, episodeID int, ok bool, err error) {
	cacheKey := fmt.Sprintf("tmdb:search:%s", parsed.Title)

	var shows []tmdb.TVShow
	if data, cacheErr := m.cache.Get(ctx, cacheKey); cacheErr == nil {
		_ = json.Unmarshal(data, &shows)
	}

	if len(shows) == 0 {
		shows, err = m.tmdb.SearchTV(ctx, parsed.Title, "zh-CN")
		if err != nil {
			return 0, 0, false, err
		}
		if len(shows) == 0 {
			return 0, 0, false, nil
		}
		if data, marshalErr := json.Marshal(shows); marshalErr == nil {
			_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
		}
	}

	show := shows[0]

	// Cross-reference: search Bangumi with the show's original name
	bangumiQuery := show.OriginalName
	if bangumiQuery == "" {
		bangumiQuery = show.Name
	}

	crossParsed := fileparse.ParsedFilename{
		Title:         bangumiQuery,
		EpisodeNumber: parsed.EpisodeNumber,
	}

	return m.matchBangumi(ctx, crossParsed)
}
