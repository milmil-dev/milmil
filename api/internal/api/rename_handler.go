package api

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/library/renamer"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

// providerMover adapts a storage.Provider to the renamer.Mover interface —
// the only shape difference is that Provider.Stat returns os.FileInfo while
// renamer.Mover (and its Stater embed) want `any` so test fakes can satisfy
// it without pulling in os.
type providerMover struct{ p storage.Provider }

func (m *providerMover) Stat(path string) (any, error) { return m.p.Stat(path) }
func (m *providerMover) MkdirAll(path string) error    { return m.p.MkdirAll(path) }
func (m *providerMover) Rename(oldPath, newPath string) error {
	return m.p.Rename(oldPath, newPath)
}

type renameConfigReq struct {
	Template string `json:"template"`
	Auto     *bool  `json:"auto"`
}

func (h *handler) handleRenameConfig(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	lib, err := h.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		return echo.ErrNotFound
	}

	var req renameConfigReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}

	if req.Template != "" {
		if _, err := renamer.Compile(req.Template); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "template invalid: "+err.Error())
		}
	}
	auto := lib.RenameAuto
	if req.Auto != nil {
		if *req.Auto {
			auto = 1
		} else {
			auto = 0
		}
	}
	if err := h.queries.UpdateLibraryRenameConfig(ctx, store.UpdateLibraryRenameConfigParams{
		Template: req.Template,
		Auto:     auto,
		ID:       libraryID,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleRenamePreview(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	animeID := c.QueryParam("anime_id")

	lib, err := h.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		return echo.ErrNotFound
	}
	if lib.RenameTemplate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "no template configured")
	}
	compiled, err := renamer.Compile(lib.RenameTemplate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "template invalid: "+err.Error())
	}

	provider, err := h.providerForLibrary(lib)
	if err != nil {
		return echo.ErrInternalServerError
	}
	defer provider.Close()

	ctxs, err := h.loadRenameFileContexts(ctx, libraryID, animeID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	mover := &providerMover{p: provider}
	plans := renamer.Plan(ctx, ctxs, compiled, lib.Path, mover)
	return c.JSON(http.StatusOK, map[string]any{"plans": plans})
}

type renameApplyReq struct {
	Plans []renamer.PlanResult `json:"plans"`
}

func (h *handler) handleRenameApply(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	lib, err := h.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		return echo.ErrNotFound
	}

	var req renameApplyReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}

	provider, err := h.providerForLibrary(lib)
	if err != nil {
		return echo.ErrInternalServerError
	}
	defer provider.Close()

	mover := &providerMover{p: provider}
	res, err := renamer.Apply(ctx, h.queries, mover, libraryID, req.Plans)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, res)
}

type renameUndoReq struct {
	BatchID string `json:"batch_id"`
}

func (h *handler) handleRenameUndo(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	lib, err := h.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		return echo.ErrNotFound
	}

	var req renameUndoReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	if req.BatchID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "batch_id required")
	}
	rows, err := h.queries.ListRenameHistoryByBatch(ctx, req.BatchID)
	if err != nil || len(rows) == 0 || rows[0].LibraryID != libraryID {
		return echo.ErrNotFound
	}

	provider, err := h.providerForLibrary(lib)
	if err != nil {
		return echo.ErrInternalServerError
	}
	defer provider.Close()

	mover := &providerMover{p: provider}
	res, err := renamer.UndoBatch(ctx, h.queries, mover, req.BatchID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, res)
}

func (h *handler) handleRenameHistory(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	rows, err := h.queries.ListRenameHistoryBatches(ctx, store.ListRenameHistoryBatchesParams{
		LibraryID: libraryID,
		Limit:     50,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, rows)
}

// loadRenameFileContexts resolves MediaFile → Episode → Anime for each file in
// either a single-anime scope (anime_id query param) or the whole library.
// ListMediaFilesByLibrary returns a joined Row type so we project it back to
// store.MediaFile — renamer.FileContext only needs the base file fields.
func (h *handler) loadRenameFileContexts(ctx context.Context, libraryID, animeID string) ([]renamer.FileContext, error) {
	var files []store.MediaFile
	if animeID != "" {
		rows, err := h.queries.ListMediaFilesByAnime(ctx, animeID)
		if err != nil {
			return nil, err
		}
		files = rows
	} else {
		rows, err := h.queries.ListMediaFilesByLibrary(ctx, store.ListMediaFilesByLibraryParams{
			LibraryID:   libraryID,
			Column2:     "all",
			Column3:     "all",
			MatchStatus: "",
			Column5:     "",
			Column6:     sql.NullString{},
			Limit:       1_000_000,
			Offset:      0,
		})
		if err != nil {
			return nil, err
		}
		files = make([]store.MediaFile, 0, len(rows))
		for _, r := range rows {
			files = append(files, store.MediaFile{
				ID:                  r.ID,
				EpisodeID:           r.EpisodeID,
				LibraryID:           r.LibraryID,
				Path:                r.Path,
				Filename:            r.Filename,
				SizeBytes:           r.SizeBytes,
				DurationSeconds:     r.DurationSeconds,
				ContainerFormat:     r.ContainerFormat,
				VideoCodec:          r.VideoCodec,
				AudioCodec:          r.AudioCodec,
				Width:               r.Width,
				Height:              r.Height,
				FileHash:            r.FileHash,
				DandanplayEpisodeID: r.DandanplayEpisodeID,
				MatchStatus:         r.MatchStatus,
				VideoTracks:         r.VideoTracks,
				AudioTracks:         r.AudioTracks,
				SubtitleTracks:      r.SubtitleTracks,
				CreatedAt:           r.CreatedAt,
				UpdatedAt:           r.UpdatedAt,
				DandanplayAnimeID:   r.DandanplayAnimeID,
				BangumiSubjectID:    r.BangumiSubjectID,
				BangumiEpisodeID:    r.BangumiEpisodeID,
			})
		}
	}

	out := make([]renamer.FileContext, 0, len(files))
	for _, f := range files {
		fc := renamer.FileContext{MediaFile: f}
		if f.EpisodeID.Valid {
			if ep, err := h.queries.GetEpisode(ctx, f.EpisodeID.String); err == nil {
				fc.Episode = ep
				if a, err := h.queries.GetAnime(ctx, ep.AnimeID); err == nil {
					fc.Anime = a
				}
			}
		}
		out = append(out, fc)
	}
	return out, nil
}
