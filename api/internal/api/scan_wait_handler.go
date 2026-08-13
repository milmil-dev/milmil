package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v5"
)

type scanWaitResponse struct {
	LibraryID   string `json:"library_id"`
	Status      string `json:"status"` // "running" | "complete" | "never_scanned"
	StartedAt   string `json:"started_at,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
}

const (
	scanWaitDefaultTimeout = 5 * time.Minute
	scanWaitMaxTimeout     = 30 * time.Minute
)

// scanWaitPollInterval is a var (not const) so tests can lower it without
// adding 2-second sleeps to every run.
var scanWaitPollInterval = 2 * time.Second

// ScanWaitPollInterval returns the current poll interval. Exported for tests
// in api_test that need to swap it temporarily.
func ScanWaitPollInterval() time.Duration { return scanWaitPollInterval }

// SetScanWaitPollInterval overrides the poll interval. Exported for tests.
func SetScanWaitPollInterval(d time.Duration) { scanWaitPollInterval = d }

// handleScanWait long-polls until the most recent scan for a library finishes
// (completed_at is set) or the timeout elapses.
//
// Query params:
//   - timeout: optional seconds, default 300, max 1800.
//
// Responses:
//   - 200 status="complete" or "never_scanned"
//   - 408 when the timeout expires before scan completes
//   - 408 when the client cancels
func (h *handler) handleScanWait(c *echo.Context) error {
	libraryID := c.Param("id")
	timeout := scanWaitDefaultTimeout
	if t, err := strconv.Atoi(c.QueryParam("timeout")); err == nil && t > 0 {
		timeout = time.Duration(t) * time.Second
		if timeout > scanWaitMaxTimeout {
			timeout = scanWaitMaxTimeout
		}
	}

	deadline := time.Now().Add(timeout)
	for {
		state, err := h.scanState(c.Request().Context(), libraryID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if state.Status != "running" {
			return c.JSON(http.StatusOK, state)
		}
		if !time.Now().Before(deadline) {
			return echo.NewHTTPError(http.StatusRequestTimeout, "scan did not complete within timeout")
		}
		select {
		case <-c.Request().Context().Done():
			return echo.NewHTTPError(http.StatusRequestTimeout, "client cancelled")
		case <-time.After(scanWaitPollInterval):
		}
	}
}

func (h *handler) scanState(ctx context.Context, libraryID string) (scanWaitResponse, error) {
	row, err := h.queries.GetLatestScanSummary(ctx, libraryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return scanWaitResponse{LibraryID: libraryID, Status: "never_scanned"}, nil
		}
		return scanWaitResponse{}, err
	}
	resp := scanWaitResponse{LibraryID: libraryID, StartedAt: row.StartedAt}
	if row.CompletedAt.Valid {
		resp.Status = "complete"
		resp.CompletedAt = row.CompletedAt.String
	} else {
		resp.Status = "running"
	}
	return resp, nil
}
