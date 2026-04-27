package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestAuditList_FiltersByUserAndAction(t *testing.T) {
	srv := newAuditTestServer(t)

	tokenPlaintext := srv.mintAPIToken(t, "list-agent")

	for i, action := range []string{"match.apply", "match.apply", "rss.create"} {
		_, err := srv.queries.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
			ID:         "row" + string(rune('a'+i)),
			UserID:     srv.testUserID,
			ActionType: action,
		})
		require.NoError(t, err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/audit?action=match.apply", nil)
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		Items []store.AuditLog `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Items, 2)
	for _, item := range resp.Items {
		require.Equal(t, "match.apply", item.ActionType)
	}
}

func TestAuditList_LimitsToOwnUser(t *testing.T) {
	srv := newAuditTestServer(t)

	// Seed an entry under a different user — must not leak across users.
	_, err := srv.db.Exec(
		`INSERT INTO users (id, username, password_hash, created_at, updated_at)
		 VALUES ('other-user', 'other', 'unused',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
	)
	require.NoError(t, err)
	_, err = srv.queries.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
		ID:         "leakcheck",
		UserID:     "other-user",
		ActionType: "match.apply",
	})
	require.NoError(t, err)

	tokenPlaintext := srv.mintAPIToken(t, "owner-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/audit", nil)
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Items []store.AuditLog `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	for _, item := range resp.Items {
		require.NotEqual(t, "other-user", item.UserID, "audit list must not leak rows across users")
	}
}

func TestAuditUndo_DryRunReportsButDoesNotMark(t *testing.T) {
	srv := newAuditTestServer(t)

	_, err := srv.queries.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
		ID:         "undo01",
		UserID:     srv.testUserID,
		ActionType: "rss.create",
	})
	require.NoError(t, err)

	tokenPlaintext := srv.mintAPIToken(t, "undo-agent")
	body := `{"id":"undo01","dry_run":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/audit/undo", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		Items []struct {
			AuditID string `json:"audit_id"`
			Status  string `json:"status"`
			Reason  string `json:"reason,omitempty"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Items, 1)
	require.Equal(t, "undo01", resp.Items[0].AuditID)
	require.Equal(t, "reversed", resp.Items[0].Status)

	row, err := srv.queries.GetAuditLog(context.Background(), "undo01")
	require.NoError(t, err)
	require.False(t, row.UndoneAt.Valid, "dry-run must not mark the row undone")
}
