package resolver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"uuid"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/library/renamer"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

// ProviderFactory constructs a storage.Provider for a library. Injected into
// Resolver so the resolver package doesn't have to know about encryption keys
// or source-type factories. Nil is allowed — auto-rename becomes a no-op.
type ProviderFactory func(lib store.Library) (storage.Provider, error)

// providerMoverAdapter bridges storage.Provider's os.FileInfo Stat signature
// to renamer.Mover's `any` Stat. Local to resolver to avoid cross-package
// coupling with the api package's identical adapter.
type providerMoverAdapter struct{ p storage.Provider }

func (a *providerMoverAdapter) Stat(path string) (any, error) { return a.p.Stat(path) }
func (a *providerMoverAdapter) MkdirAll(path string) error    { return a.p.MkdirAll(path) }
func (a *providerMoverAdapter) Rename(o, n string) error      { return a.p.Rename(o, n) }

type ResolveSummary struct {
	AnimeCreated    int `json:"anime_created"`
	EpisodesCreated int `json:"episodes_created"`
	FilesLinked     int `json:"files_linked"`
	Errors          int `json:"errors"`
}

type Resolver struct {
	queries     *store.Queries
	bangumi     bangumi.Client
	dandanplay  dandanplay.Client
	cache       cache.Cache
	anidb       *anidb.Service
	newProvider ProviderFactory
}

func New(q *store.Queries, bgm bangumi.Client, ddp dandanplay.Client, c cache.Cache, anidbSvc *anidb.Service, newProvider ProviderFactory) *Resolver {
	return &Resolver{queries: q, bangumi: bgm, dandanplay: ddp, cache: c, anidb: anidbSvc, newProvider: newProvider}
}

// runAutoRename renders and applies the library's rename template for every
// media file of the given anime. Best-effort: any error logs a warning and
// returns without blocking the resolver pipeline.
func (r *Resolver) runAutoRename(ctx context.Context, animeID string) {
	if r.newProvider == nil {
		return
	}
	anime, err := r.queries.GetAnime(ctx, animeID)
	if err != nil {
		return
	}
	if !anime.LibraryID.Valid {
		return
	}
	lib, err := r.queries.GetLibrary(ctx, anime.LibraryID.String)
	if err != nil {
		return
	}
	if lib.RenameAuto != 1 || lib.RenameTemplate == "" {
		return
	}
	compiled, err := renamer.Compile(lib.RenameTemplate)
	if err != nil {
		slog.Warn("renamer: auto compile", "library", lib.ID, "err", err)
		return
	}
	files, err := r.queries.ListMediaFilesByAnime(ctx, animeID)
	if err != nil {
		return
	}
	if len(files) == 0 {
		return
	}
	provider, err := r.newProvider(lib)
	if err != nil {
		slog.Warn("renamer: provider", "library", lib.ID, "err", err)
		return
	}
	defer provider.Close()

	ctxs := make([]renamer.FileContext, 0, len(files))
	for _, f := range files {
		fc := renamer.FileContext{MediaFile: f, Anime: anime}
		if f.EpisodeID.Valid {
			if ep, err := r.queries.GetEpisode(ctx, f.EpisodeID.String); err == nil {
				fc.Episode = ep
			}
		}
		ctxs = append(ctxs, fc)
	}

	mover := &providerMoverAdapter{p: provider}
	plans := renamer.Plan(ctx, ctxs, compiled, lib.Path, mover)
	if _, err := renamer.Apply(ctx, r.queries, mover, lib.ID, plans); err != nil {
		slog.Warn("renamer: apply", "library", lib.ID, "err", err)
	}
}

// nullInt64Value returns the int64 inside n, or 0 if invalid.
func nullInt64Value(n sql.NullInt64) int64 {
	if n.Valid {
		return n.Int64
	}
	return 0
}

// enrichExternalIDs consults the anidb cross-site mapping to fill any missing
// external IDs for an anime row. No-op when the service is unavailable or when
// no new info is learned. Uses UpdateAnimeExternalIDs which COALESCEs — never
// overwrites existing values.
func (r *Resolver) enrichExternalIDs(ctx context.Context, animeID string) {
	if r.anidb == nil {
		return
	}
	row, err := r.queries.GetAnime(ctx, animeID)
	if err != nil {
		return
	}
	seed := anidb.IDSet{
		Bangumi: nullInt64Value(row.BangumiID),
		AniList: nullInt64Value(row.AnilistID),
		MAL:     nullInt64Value(row.MalID),
		TMDB:    nullInt64Value(row.TmdbID),
		AniDB:   nullInt64Value(row.AnidbID),
	}
	merged := seed
	for _, src := range anidb.AllSources() {
		if id := seed.Get(src); id != 0 {
			if set, ok := r.anidb.Resolve(src, id); ok {
				merged.Merge(set)
			}
		}
	}
	if merged == seed {
		return
	}
	params := store.UpdateAnimeExternalIDsParams{ID: row.ID}
	if merged.AniDB != 0 {
		params.AnidbID = sql.NullInt64{Int64: merged.AniDB, Valid: true}
	}
	if merged.AniList != 0 {
		params.AnilistID = sql.NullInt64{Int64: merged.AniList, Valid: true}
	}
	if merged.Bangumi != 0 {
		params.BangumiID = sql.NullInt64{Int64: merged.Bangumi, Valid: true}
	}
	if merged.MAL != 0 {
		params.MalID = sql.NullInt64{Int64: merged.MAL, Valid: true}
	}
	if merged.TMDB != 0 {
		params.TmdbID = sql.NullInt64{Int64: merged.TMDB, Valid: true}
	}
	if err := r.queries.UpdateAnimeExternalIDs(ctx, params); err != nil {
		slog.Warn("resolver: anidb enrichment failed", "anime", row.ID, "err", err)
	}
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

		r.enrichExternalIDs(ctx, anime.ID)

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

		// Auto-rename once all files for this anime are linked to their episodes.
		r.runAutoRename(ctx, anime.ID)
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

	r.enrichExternalIDs(ctx, anime.ID)

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

	// Auto-rename once all files for this anime are linked to their episodes.
	r.runAutoRename(ctx, anime.ID)

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
		// Backfill library_id if the anime was created without one (e.g., from collection)
		if !existing.LibraryID.Valid && libraryID != "" {
			_ = r.queries.UpdateAnimeLibraryID(ctx, store.UpdateAnimeLibraryIDParams{
				LibraryID: sql.NullString{String: libraryID, Valid: true},
				ID:        existing.ID,
			})
			existing.LibraryID = sql.NullString{String: libraryID, Valid: true}
		}
		// Backfill community score for pre-existing records
		if existing.Score == 0 {
			if subj, sErr := r.bangumi.GetSubject(ctx, int(bangumiID)); sErr == nil && subj != nil && subj.Rating.Score > 0 {
				_ = r.queries.UpdateAnimeScore(ctx, store.UpdateAnimeScoreParams{
					Score:     subj.Rating.Score,
					BangumiID: existing.BangumiID,
				})
				existing.Score = subj.Rating.Score
			}
		}
		// Backfill title_original for rows created before the column existed,
		// so Latin-script searches ("BLEACH") can find a series stored under
		// its Chinese title.
		if !existing.TitleOriginal.Valid || existing.TitleOriginal.String == "" {
			if subj, sErr := r.bangumi.GetSubject(ctx, int(bangumiID)); sErr == nil && subj != nil && subj.Name != "" {
				_ = r.queries.UpdateAnimeTitleOriginal(ctx, store.UpdateAnimeTitleOriginalParams{
					TitleOriginal: sql.NullString{String: subj.Name, Valid: true},
					ID:            existing.ID,
				})
				existing.TitleOriginal = sql.NullString{String: subj.Name, Valid: true}
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
		ID:                  uuid.New().String(),
		LibraryID:           sql.NullString{String: libraryID, Valid: true},
		Title:               title,
		TitleZh:             sql.NullString{String: subject.NameCN, Valid: subject.NameCN != ""},
		TitleOriginal:       sql.NullString{String: subject.Name, Valid: subject.Name != ""},
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
			ID:                  uuid.New().String(),
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
