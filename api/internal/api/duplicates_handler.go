package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/library/duplicates"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

// providerForLibrary delegates to storage.ProviderForLibrary, binding the
// handler's encryption key so callers can keep the short method form.
func (h *handler) providerForLibrary(lib store.Library) (storage.Provider, error) {
	return storage.ProviderForLibrary(lib, h.encryptionKey)
}

func (h *handler) handleAnimeDuplicates(c *echo.Context) error {
	ctx := c.Request().Context()
	idStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}
	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("duplicates: lookup anime failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}
	sets, err := duplicates.FindAnimeDuplicates(ctx, h.queries, anime.ID)
	if err != nil {
		slog.Error("duplicates: FindAnimeDuplicates failed", "anime_id", anime.ID, "err", err)
		return echo.ErrInternalServerError
	}
	if sets == nil {
		sets = []duplicates.DupSet{}
	}
	return c.JSON(http.StatusOK, sets)
}

func (h *handler) handleLibraryDuplicates(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	sets, err := duplicates.FindLibraryDuplicates(ctx, h.queries, libraryID)
	if err != nil {
		slog.Error("duplicates: FindLibraryDuplicates failed", "library_id", libraryID, "err", err)
		return echo.ErrInternalServerError
	}
	if sets == nil {
		sets = []duplicates.DupSet{}
	}
	return c.JSON(http.StatusOK, sets)
}

type setPreferredReq struct {
	MediaFileID string `json:"media_file_id"`
}

func (h *handler) handleSetEpisodePreferred(c *echo.Context) error {
	ctx := c.Request().Context()
	episodeID := c.Param("id")
	var req setPreferredReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	if req.MediaFileID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "media_file_id required")
	}

	mf, err := h.queries.GetMediaFileByID(ctx, req.MediaFileID)
	if err != nil {
		return echo.ErrNotFound
	}
	if !mf.EpisodeID.Valid || mf.EpisodeID.String != episodeID {
		return echo.NewHTTPError(http.StatusBadRequest, "file does not belong to this episode")
	}

	if err := h.queries.SetEpisodePreferredManual(ctx, store.SetEpisodePreferredManualParams{
		FileID: sql.NullString{String: req.MediaFileID, Valid: true},
		ID:     episodeID,
	}); err != nil {
		slog.Error("duplicates: SetEpisodePreferredManual failed", "episode_id", episodeID, "err", err)
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleDeleteMediaFile(c *echo.Context) error {
	ctx := c.Request().Context()
	id := c.Param("id")
	mf, err := h.queries.GetMediaFileByID(ctx, id)
	if err != nil {
		return echo.ErrNotFound
	}
	library, err := h.queries.GetLibrary(ctx, mf.LibraryID)
	if err != nil {
		slog.Error("duplicates: GetLibrary failed", "library_id", mf.LibraryID, "err", err)
		return echo.ErrInternalServerError
	}
	provider, err := h.providerForLibrary(library)
	if err != nil {
		slog.Error("duplicates: provider init failed", "library_id", library.ID, "err", err)
		return echo.ErrInternalServerError
	}
	defer provider.Close()

	if err := duplicates.DeleteMediaFile(ctx, h.queries, provider, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "delete failed: "+err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleLibraryDuplicateCleanup(c *echo.Context) error {
	ctx := c.Request().Context()
	libraryID := c.Param("id")
	library, err := h.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("duplicates: GetLibrary failed", "library_id", libraryID, "err", err)
		return echo.ErrInternalServerError
	}
	provider, err := h.providerForLibrary(library)
	if err != nil {
		slog.Error("duplicates: provider init failed", "library_id", library.ID, "err", err)
		return echo.ErrInternalServerError
	}
	defer provider.Close()

	res, err := duplicates.DeleteLibraryNonPreferred(ctx, h.queries, provider, libraryID)
	if err != nil {
		slog.Error("duplicates: DeleteLibraryNonPreferred failed", "library_id", libraryID, "err", err)
		return echo.ErrInternalServerError
	}
	errStrs := make([]string, 0, len(res.Errors))
	for _, e := range res.Errors {
		errStrs = append(errStrs, e.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{
		"deleted":         res.Deleted,
		"reclaimed_bytes": res.ReclaimedBytes,
		"skipped":         res.Skipped,
		"errors":          errStrs,
	})
}
