package matcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/store"
)

type MatchSummary struct {
	Matched   int `json:"matched"`
	Unmatched int `json:"unmatched"`
	Errors    int `json:"errors"`
}

type Matcher struct {
	queries    *store.Queries
	dandanplay dandanplay.Client
	cache      cache.Cache
}

func New(q *store.Queries, ddp dandanplay.Client, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, cache: c}
}

func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string) (*MatchSummary, error) {
	files, err := m.queries.ListUnmatchedMediaFilesByLibrary(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	summary := &MatchSummary{}

	for _, f := range files {
		if !f.FileHash.Valid || f.FileHash.String == "" {
			summary.Unmatched++
			continue
		}

		episodeID, animeID, matched, matchErr := m.matchSingleFile(ctx, f)
		if matchErr != nil {
			summary.Errors++
			continue
		}
		if matched {
			summary.Matched++
			_ = m.queries.UpdateMediaFileDandanplayIDs(ctx, store.UpdateMediaFileDandanplayIDsParams{
				DandanplayEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
				DandanplayAnimeID:   sql.NullInt64{Int64: animeID, Valid: true},
				ID:                  f.ID,
			})
		} else {
			summary.Unmatched++
		}
	}

	return summary, nil
}

func (m *Matcher) matchSingleFile(ctx context.Context, f store.MediaFile) (episodeID int64, animeID int64, matched bool, err error) {
	cacheKey := fmt.Sprintf("danmaku:match:%s", f.FileHash.String)

	// Check cache
	if data, cacheErr := m.cache.Get(ctx, cacheKey); cacheErr == nil {
		var cached [2]int64
		if json.Unmarshal(data, &cached) == nil && cached[0] > 0 {
			return cached[0], cached[1], true, nil
		}
	}

	// Call DandanPlay
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

	// Cache the match
	if data, marshalErr := json.Marshal([2]int64{episodeID, animeID}); marshalErr == nil {
		_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}

	return episodeID, animeID, true, nil
}
