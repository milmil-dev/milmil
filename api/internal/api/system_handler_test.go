package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/updatecheck"
)

// newTestAppWithChecker is a thin wrapper around newTestAppWithDBAndChecker
// (defined in stream_handler_test.go) that drops the *sql.DB return value
// for tests that don't touch the DB. Used by the /update-check tests below.
func newTestAppWithChecker(t *testing.T, checker *updatecheck.Checker) *echo.Echo {
	t.Helper()
	app, _ := newTestAppWithDBAndChecker(t, checker)
	return app
}

func TestUpdateCheck_HasUpdate(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": "v999.0.0", "html_url": "https://example/v999",
			"published_at": time.Date(2026, 4, 30, 10, 0, 0, 0, time.UTC),
		})
	}))
	t.Cleanup(srv.Close)
	stub := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Hour,
	})
	if _, _, err := stub.Check(context.Background()); err != nil {
		t.Fatalf("seed: %v", err)
	}

	app := newTestAppWithChecker(t, stub)
	req := makeAuthRequest(t, app, http.MethodGet, "/api/v1/system/update-check", "")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d body=%s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["latest"] != "999.0.0" {
		t.Errorf("latest: %v", got["latest"])
	}
	if got["has_update"] != true {
		t.Errorf("has_update: %v", got["has_update"])
	}
	if got["stale"] != false {
		t.Errorf("stale: %v", got["stale"])
	}
}

func TestUpdateCheck_NeverCachedOffline(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	stub := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Hour,
	})
	app := newTestAppWithChecker(t, stub)
	req := makeAuthRequest(t, app, http.MethodGet, "/api/v1/system/update-check", "")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d", rec.Code)
	}
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["latest"] != nil {
		t.Errorf("latest: got %v want nil", got["latest"])
	}
	if got["has_update"] != false {
		t.Errorf("has_update: got %v want false", got["has_update"])
	}
}
