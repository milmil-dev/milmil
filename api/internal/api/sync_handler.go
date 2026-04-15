package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
)

type syncErrorEntry struct {
	AnimeID string `json:"anime_id"`
	Error   string `json:"error"`
	At      string `json:"at"`
}

type syncProviderStatus struct {
	Provider   string           `json:"provider"`
	Connected  bool             `json:"connected"`
	LastSync   string           `json:"last_sync"`
	Pending    int64            `json:"pending"`
	LastErrors []syncErrorEntry `json:"last_errors"`
}

// GET /api/v1/sync/status
//
// Returns per-provider tracker sync status for the authenticated user:
// connection state, last successful sync timestamp, pending outbox count,
// and the most recent errors (up to 10, from the outbox history).
func (h *handler) handleSyncProvidersStatus(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	providers := []milmilsync.ProviderName{
		milmilsync.ProviderAniList,
		milmilsync.ProviderBangumi,
	}

	out := make([]syncProviderStatus, 0, len(providers))
	for _, p := range providers {
		providerStr := string(p)

		// Connected iff we have a stored token.
		_, tokErr := h.queries.GetSetting(ctx, providerStr+"_token")
		connected := tokErr == nil

		pending, err := h.queries.CountPendingSyncOpsByUserProvider(ctx,
			store.CountPendingSyncOpsByUserProviderParams{
				UserID:   userID,
				Provider: providerStr,
			})
		if err != nil {
			return echo.ErrInternalServerError
		}

		lastSync := ""
		lastOp, err := h.queries.GetLatestCompletedSyncOp(ctx,
			store.GetLatestCompletedSyncOpParams{
				UserID:   userID,
				Provider: providerStr,
			})
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return echo.ErrInternalServerError
		}
		if err == nil && lastOp.CompletedAt.Valid {
			lastSync = lastOp.CompletedAt.String
		}

		errRows, err := h.queries.ListRecentSyncErrors(ctx,
			store.ListRecentSyncErrorsParams{
				UserID:   userID,
				Provider: providerStr,
			})
		if err != nil {
			return echo.ErrInternalServerError
		}
		errs := make([]syncErrorEntry, 0, len(errRows))
		for _, e := range errRows {
			msg := ""
			if e.LastError.Valid {
				msg = e.LastError.String
			}
			errs = append(errs, syncErrorEntry{
				AnimeID: e.AnimeID,
				Error:   msg,
				At:      e.CreatedAt,
			})
		}

		out = append(out, syncProviderStatus{
			Provider:   providerStr,
			Connected:  connected,
			LastSync:   lastSync,
			Pending:    pending,
			LastErrors: errs,
		})
	}

	return c.JSON(http.StatusOK, out)
}
