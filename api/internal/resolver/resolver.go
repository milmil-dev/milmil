package resolver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/store"
)

type ResolveSummary struct {
	AnimeCreated    int `json:"anime_created"`
	EpisodesCreated int `json:"episodes_created"`
	FilesLinked     int `json:"files_linked"`
	Errors          int `json:"errors"`
}

type Resolver struct {
	queries    *store.Queries
	bangumi    bangumi.Client
	dandanplay dandanplay.Client
	cache      cache.Cache
}

func New(q *store.Queries, bgm bangumi.Client, ddp dandanplay.Client, c cache.Cache) *Resolver {
	return &Resolver{queries: q, bangumi: bgm, dandanplay: ddp, cache: c}
}

func (r *Resolver) ResolveLibrary(ctx context.Context, libraryID string) (*ResolveSummary, error) {
	files, err := r.queries.ListMatchedUnlinkedMediaFiles(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	summary := &ResolveSummary{}

	// Group by dandanplay_anime_id to avoid duplicate lookups
	animeGroups := make(map[int64][]store.MediaFile)
	for _, f := range files {
		if !f.DandanplayAnimeID.Valid {
			continue
		}
		animeGroups[f.DandanplayAnimeID.Int64] = append(animeGroups[f.DandanplayAnimeID.Int64], f)
	}

	for ddpAnimeID, groupFiles := range animeGroups {
		if err := r.resolveAnimeGroup(ctx, libraryID, ddpAnimeID, groupFiles, summary); err != nil {
			summary.Errors++
			continue // non-fatal
		}
	}

	return summary, nil
}

// ResolveBangumiMatched processes files matched via Bangumi/AniList/TMDB strategies.
// These files have bangumi_subject_id set but no episode_id yet.
func (r *Resolver) ResolveBangumiMatched(ctx context.Context, libraryID string) (*ResolveSummary, error) {
	files, err := r.queries.ListBangumiMatchedUnlinkedMediaFiles(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	slog.Info("resolver: ResolveBangumiMatched", "library_id", libraryID, "unlinked_files", len(files))

	summary := &ResolveSummary{}

	// Group by bangumi_subject_id
	groups := make(map[int64][]store.MediaFile)
	for _, f := range files {
		if !f.BangumiSubjectID.Valid {
			continue
		}
		groups[f.BangumiSubjectID.Int64] = append(groups[f.BangumiSubjectID.Int64], f)
	}

	slog.Info("resolver: ResolveBangumiMatched", "anime_groups", len(groups))

	for bangumiID, groupFiles := range groups {
		anime, created, err := r.getOrCreateAnime(ctx, libraryID, bangumiID, 0)
		if err != nil {
			slog.Error("resolver: getOrCreateAnime failed", "bangumi_id", bangumiID, "err", err)
			summary.Errors++
			continue
		}
		if created {
			slog.Info("resolver: created anime", "bangumi_id", bangumiID, "anime_id", anime.ID, "title", anime.Title)
			summary.AnimeCreated++
		}

		epsCreated, err := r.ensureEpisodes(ctx, anime.ID, bangumiID)
		if err != nil {
			slog.Error("resolver: ensureEpisodes failed", "bangumi_id", bangumiID, "err", err)
			summary.Errors++
			continue
		}
		summary.EpisodesCreated += epsCreated

		// Link files by bangumi_episode_id
		for _, f := range groupFiles {
			if !f.BangumiEpisodeID.Valid {
				slog.Warn("resolver: file has no bangumi_episode_id", "file_id", f.ID, "filename", f.Filename)
				continue
			}

			eps, _ := r.queries.ListEpisodesByAnimeID(ctx, anime.ID)
			linked := false
			for _, ep := range eps {
				if ep.DandanplayEpisodeID.Valid && ep.DandanplayEpisodeID.Int64 == f.BangumiEpisodeID.Int64 {
					_ = r.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
						EpisodeID: sql.NullString{String: ep.ID, Valid: true},
						ID:        f.ID,
					})
					summary.FilesLinked++
					linked = true
					break
				}
			}
			if !linked {
				slog.Warn("resolver: no episode matched",
					"file", f.Filename,
					"bangumi_episode_id", f.BangumiEpisodeID.Int64,
					"episodes_checked", len(eps),
				)
			}
		}
	}

	return summary, nil
}

func (r *Resolver) resolveAnimeGroup(ctx context.Context, libraryID string, ddpAnimeID int64, files []store.MediaFile, summary *ResolveSummary) error {
	// 1. Resolve DandanPlay animeId → Bangumi subjectId
	bangumiID, err := r.resolveBangumiID(ctx, ddpAnimeID)
	if err != nil || bangumiID == 0 {
		return fmt.Errorf("resolve bangumi ID: %w", err)
	}

	// 2. Get or create anime record
	anime, created, err := r.getOrCreateAnime(ctx, libraryID, bangumiID, ddpAnimeID)
	if err != nil {
		return err
	}
	if created {
		summary.AnimeCreated++
	}

	// 3. Ensure episodes exist
	epsCreated, err := r.ensureEpisodes(ctx, anime.ID, bangumiID)
	if err != nil {
		return err
	}
	summary.EpisodesCreated += epsCreated

	// 4. Link files to episodes
	for _, f := range files {
		if !f.DandanplayEpisodeID.Valid {
			continue
		}
		ep, err := r.queries.GetEpisodeByDandanplayID(ctx, f.DandanplayEpisodeID)
		if err != nil {
			continue // episode not found — skip
		}
		_ = r.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
			EpisodeID: sql.NullString{String: ep.ID, Valid: true},
			ID:        f.ID,
		})
		summary.FilesLinked++
	}

	return nil
}

func (r *Resolver) resolveBangumiID(ctx context.Context, ddpAnimeID int64) (int64, error) {
	cacheKey := fmt.Sprintf("resolve:ddp2bgm:%d", ddpAnimeID)
	if data, err := r.cache.Get(ctx, cacheKey); err == nil {
		var id int64
		if json.Unmarshal(data, &id) == nil {
			return id, nil
		}
	}

	info, err := r.dandanplay.GetBangumiInfo(ctx, ddpAnimeID)
	if err != nil {
		return 0, err
	}

	if data, err := json.Marshal(info.BangumiID); err == nil {
		_ = r.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}

	return info.BangumiID, nil
}

func (r *Resolver) getOrCreateAnime(ctx context.Context, libraryID string, bangumiID, ddpAnimeID int64) (store.Anime, bool, error) {
	existing, err := r.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err == nil {
		// Backfill community score for pre-existing records
		if existing.Score == 0 {
			if subj, sErr := r.bangumi.GetSubject(ctx, int(bangumiID)); sErr == nil && subj.Rating.Score > 0 {
				_ = r.queries.UpdateAnimeScore(ctx, store.UpdateAnimeScoreParams{
					Score:     subj.Rating.Score,
					BangumiID: existing.BangumiID,
				})
				existing.Score = subj.Rating.Score
			}
		}
		return existing, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return store.Anime{}, false, err
	}

	// Fetch from Bangumi
	subject, err := r.bangumi.GetSubject(ctx, int(bangumiID))
	if err != nil {
		return store.Anime{}, false, err
	}

	title := subject.NameCN
	if title == "" {
		title = subject.Name
	}

	// Determine watch status from collection setting
	watchStatus := "watching"
	setting, err := r.queries.GetSetting(ctx, "collection")
	if err == nil {
		var col struct {
			AutoAdd *bool `json:"auto_add_to_collection"`
		}
		if json.Unmarshal([]byte(setting.Value), &col) == nil && col.AutoAdd != nil && !*col.AutoAdd {
			watchStatus = "none"
		}
	}

	anime, err := r.queries.CreateAnime(ctx, store.CreateAnimeParams{
		ID:                  uuid.NewString(),
		LibraryID:           sql.NullString{String: libraryID, Valid: true},
		Title:               title,
		TitleZh:             sql.NullString{String: subject.NameCN, Valid: subject.NameCN != ""},
		Synopsis:            sql.NullString{String: subject.Summary, Valid: subject.Summary != ""},
		CoverImageUrl:       sql.NullString{String: subject.Images.Large, Valid: subject.Images.Large != ""},
		TotalEpisodes:       sql.NullInt64{Int64: int64(subject.Eps), Valid: subject.Eps > 0},
		Status:              "unknown",
		AirDate:             sql.NullString{String: subject.AirDate, Valid: subject.AirDate != ""},
		Genres:              "[]",
		BangumiID:           sql.NullInt64{Int64: bangumiID, Valid: true},
		DandanplayBangumiID: sql.NullInt64{Int64: ddpAnimeID, Valid: true},
		WatchStatus:         watchStatus,
		Score:               subject.Rating.Score,
	})
	if err != nil {
		return store.Anime{}, false, err
	}

	return anime, true, nil
}

func (r *Resolver) ensureEpisodes(ctx context.Context, animeID string, bangumiID int64) (int, error) {
	// Check if episodes already exist
	existing, _ := r.queries.ListEpisodesByAnimeID(ctx, animeID)
	if len(existing) > 0 {
		return 0, nil
	}

	eps, err := r.bangumi.GetSubjectEpisodes(ctx, int(bangumiID))
	if err != nil {
		return 0, err
	}

	created := 0
	for _, ep := range eps {
		title := ep.NameCN
		if title == "" {
			title = ep.Name
		}
		_, err := r.queries.CreateEpisode(ctx, store.CreateEpisodeParams{
			ID:                  uuid.NewString(),
			AnimeID:             animeID,
			EpisodeNumber:       ep.Sort,
			Title:               sql.NullString{String: title, Valid: title != ""},
			TitleZh:             sql.NullString{String: ep.NameCN, Valid: ep.NameCN != ""},
			AirDate:             sql.NullString{String: ep.AirDate, Valid: ep.AirDate != ""},
			DandanplayEpisodeID: sql.NullInt64{Int64: int64(ep.ID), Valid: ep.ID > 0},
			BangumiEpisodeID:    sql.NullInt64{Int64: int64(ep.ID), Valid: false}, // Bangumi episode ID is different from DandanPlay
		})
		if err != nil {
			continue // non-fatal
		}
		created++
	}

	return created, nil
}
