package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func seedLibrary(t *testing.T, srv *auditTestServer, libraryID string) {
	t.Helper()
	_, err := srv.db.Exec(
		`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes, source_type, created_at, updated_at)
		 VALUES (?, 'lib', '/tmp/lib', 1, 0, 'local',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
		libraryID,
	)
	require.NoError(t, err)
}

func TestScanWait_NeverScanned(t *testing.T) {
	srv := newAuditTestServer(t)
	seedLibrary(t, srv, "lib-1")

	tok := srv.mintAPIToken(t, "scan-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/lib-1/scan/wait", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		LibraryID string `json:"library_id"`
		Status    string `json:"status"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "lib-1", resp.LibraryID)
	require.Equal(t, "never_scanned", resp.Status)
}

func TestScanWait_ReturnsImmediatelyWhenComplete(t *testing.T) {
	srv := newAuditTestServer(t)
	seedLibrary(t, srv, "lib-2")

	summary, err := srv.queries.CreateScanSummary(context.Background(), store.CreateScanSummaryParams{
		ID:        "scan-1",
		LibraryID: "lib-2",
	})
	require.NoError(t, err)
	require.NoError(t, srv.queries.CompleteScanSummary(context.Background(), store.CompleteScanSummaryParams{
		ID:             summary.ID,
		FilesFound:     10,
		FilesUnmatched: 1,
	}))

	tok := srv.mintAPIToken(t, "scan-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/lib-2/scan/wait", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()

	start := time.Now()
	srv.e.ServeHTTP(rec, req)
	elapsed := time.Since(start)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Less(t, elapsed, 500*time.Millisecond, "completed scan must return promptly")

	var resp struct {
		Status string `json:"status"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "complete", resp.Status)
}

func TestScanWait_TimesOutWhileRunning(t *testing.T) {
	prev := api.ScanWaitPollInterval()
	api.SetScanWaitPollInterval(20 * time.Millisecond)
	t.Cleanup(func() { api.SetScanWaitPollInterval(prev) })

	srv := newAuditTestServer(t)
	seedLibrary(t, srv, "lib-3")

	_, err := srv.queries.CreateScanSummary(context.Background(), store.CreateScanSummaryParams{
		ID:        "scan-running",
		LibraryID: "lib-3",
	})
	require.NoError(t, err)

	tok := srv.mintAPIToken(t, "scan-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/lib-3/scan/wait?timeout=1", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestTimeout, rec.Code, "body=%s", rec.Body.String())
}

func TestScanWait_ReturnsWhenScanCompletesMidPoll(t *testing.T) {
	prev := api.ScanWaitPollInterval()
	api.SetScanWaitPollInterval(20 * time.Millisecond)
	t.Cleanup(func() { api.SetScanWaitPollInterval(prev) })

	srv := newAuditTestServer(t)
	seedLibrary(t, srv, "lib-4")

	summary, err := srv.queries.CreateScanSummary(context.Background(), store.CreateScanSummaryParams{
		ID:        "scan-mid",
		LibraryID: "lib-4",
	})
	require.NoError(t, err)

	// Mark complete after 100ms — handler should pick it up on the next poll.
	go func() {
		time.Sleep(100 * time.Millisecond)
		_ = srv.queries.CompleteScanSummary(context.Background(), store.CompleteScanSummaryParams{
			ID:             summary.ID,
			FilesFound:     5,
			FilesUnmatched: 0,
		})
	}()

	tok := srv.mintAPIToken(t, "scan-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/lib-4/scan/wait?timeout=10", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())
	var resp struct {
		Status string `json:"status"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "complete", resp.Status)
}
