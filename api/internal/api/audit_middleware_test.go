package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

// auditTestServer wires an Echo app + raw *sql.DB so tests can inspect the
// audit_log table directly. Mirrors newTestApp but exposes the DB.
type auditTestServer struct {
	e          *echo.Echo
	db         *sql.DB
	queries    *store.Queries
	testUserID string
}

// auditRow is a minimal projection of audit_log used by these tests. We query
// the table directly because the generated ListAuditLogByUser query mixes
// positional and named params in a way modernc-sqlite cannot bind.
type auditRow struct {
	ActionType string
	AgentLabel sql.NullString
	TokenID    sql.NullString
	UserID     string
	AfterJson  sql.NullString
}

func listAuditRows(t *testing.T, d *sql.DB, userID string) []auditRow {
	t.Helper()
	rows, err := d.Query(
		`SELECT action_type, agent_label, token_id, user_id, after_json
		   FROM audit_log
		  WHERE user_id = ?
		  ORDER BY created_at ASC, id ASC`,
		userID,
	)
	require.NoError(t, err)
	defer rows.Close()
	var out []auditRow
	for rows.Next() {
		var r auditRow
		require.NoError(t, rows.Scan(&r.ActionType, &r.AgentLabel, &r.TokenID, &r.UserID, &r.AfterJson))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

func newAuditTestServer(t *testing.T) *auditTestServer {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	require.NoError(t, err)
	require.NoError(t, db.MigrateUp(migrations.FS, dsn))

	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(nil, nil, c)
	e := api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	q := store.New(database)
	user, err := q.CreateUser(context.Background(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Username:     "audit-tester",
		PasswordHash: "unused",
	})
	require.NoError(t, err)

	return &auditTestServer{e: e, db: database, queries: q, testUserID: user.ID}
}

// mintAPIToken inserts an API token with the given name directly into the
// database (bypassing the middleware) and returns the plaintext token.
func (s *auditTestServer) mintAPIToken(t *testing.T, name string) string {
	t.Helper()
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	require.NoError(t, err)
	_, err = s.queries.CreateAPIToken(context.Background(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          name,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        s.testUserID,
		LastIp:        "127.0.0.1",
		LastUserAgent: "milmil-cli/test",
	})
	require.NoError(t, err)
	return plaintext
}

func TestAuditMiddleware_WritesEntryOnMutatingRequest(t *testing.T) {
	srv := newAuditTestServer(t)

	tokenPlaintext := srv.mintAPIToken(t, "test-agent")

	body := `{"name":"second-token"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-tokens", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "milmil-cli/test")

	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code, "body=%s", rec.Body.String())

	rows := listAuditRows(t, srv.db, srv.testUserID)
	require.Len(t, rows, 1)
	require.Equal(t, "api_token.create", rows[0].ActionType)
	require.True(t, rows[0].AgentLabel.Valid)
	require.Equal(t, "test-agent", rows[0].AgentLabel.String)
	require.True(t, rows[0].TokenID.Valid)
	require.Equal(t, srv.testUserID, rows[0].UserID)
	require.True(t, rows[0].AfterJson.Valid)

	var captured map[string]any
	require.NoError(t, json.Unmarshal([]byte(rows[0].AfterJson.String), &captured))
	require.Equal(t, "second-token", captured["name"])
}

func TestAuditMiddleware_SkipsReadRequests(t *testing.T) {
	srv := newAuditTestServer(t)

	tokenPlaintext := srv.mintAPIToken(t, "reader-agent")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/api-tokens", nil)
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	rows := listAuditRows(t, srv.db, srv.testUserID)
	require.Empty(t, rows, "GET requests must not write audit_log rows")
}

func TestAuditMiddleware_RedactsSensitiveFields(t *testing.T) {
	srv := newAuditTestServer(t)
	tokenPlaintext := srv.mintAPIToken(t, "redact-agent")

	// /api-tokens isn't an auth path, so the body IS captured — but any
	// 'token'/'password'/'secret' key must be redacted before storage.
	body := `{"name":"x","token":"mlml_should_not_land_in_db","password":"hunter2"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-tokens", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code, "body=%s", rec.Body.String())

	rows := listAuditRows(t, srv.db, srv.testUserID)
	require.Len(t, rows, 1)
	require.True(t, rows[0].AfterJson.Valid)
	require.NotContains(t, rows[0].AfterJson.String, "mlml_should_not_land_in_db")
	require.NotContains(t, rows[0].AfterJson.String, "hunter2")
	require.Contains(t, rows[0].AfterJson.String, "[REDACTED]")
}

func TestAuditMiddleware_SkipsBodyForAuthPaths(t *testing.T) {
	srv := newAuditTestServer(t)
	tokenPlaintext := srv.mintAPIToken(t, "auth-agent")

	// PUT /auth/password — even with redaction, we belt-and-braces skip
	// body capture entirely on /api/v1/auth/* so a malformed-JSON body
	// containing a password can't round-trip into after_json.
	body := `{"current_password":"old-pass","new_password":"new-pass-Tr0ub4dor!!"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/auth/password", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	// We don't care about the response status (the user's stored password
	// hash isn't 'old-pass' so it'll 4xx) — only that NO audit row leaks
	// the body, regardless of outcome.

	rows := listAuditRows(t, srv.db, srv.testUserID)
	for _, r := range rows {
		if r.AfterJson.Valid {
			require.NotContains(t, r.AfterJson.String, "old-pass",
				"auth path body must not appear in after_json")
			require.NotContains(t, r.AfterJson.String, "new-pass-Tr0ub4dor!!",
				"auth path body must not appear in after_json")
		}
	}
}

func TestAuditMiddleware_SkipsFailedMutations(t *testing.T) {
	srv := newAuditTestServer(t)

	tokenPlaintext := srv.mintAPIToken(t, "failing-agent")

	// Empty name → 400 from handleCreateAPIToken
	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-tokens", strings.NewReader(`{"name":""}`))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rows := listAuditRows(t, srv.db, srv.testUserID)
	require.Empty(t, rows, "non-success responses must not write audit_log rows")
}
