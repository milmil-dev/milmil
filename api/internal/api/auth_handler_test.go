package api_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/updatecheck"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

// noopChecker returns an updatecheck.Checker pointed at a non-routable BaseURL
// so any unintended Check() call fails cleanly (no panic, no real network).
// Tests that exercise the /update-check handler should construct their own
// Checker via newTestAppWithChecker.
func noopChecker() *updatecheck.Checker {
	return updatecheck.NewChecker(updatecheck.Config{
		Repo:    "test/test",
		BaseURL: "http://127.0.0.1:0",
		TTL:     time.Hour,
	})
}

// newTestDB opens a sqlite test DB inside its own temp dir and registers a
// cleanup that closes the DB and force-removes the temp dir. The latter
// retries briefly to absorb the race against fire-and-forget DB goroutines
// (e.g. updateTokenActivity) that would otherwise leave stray files behind
// and fail t.TempDir's own RemoveAll cleanup.
func newTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	tmp, err := os.MkdirTemp("", "milmiltest-*")
	if err != nil {
		t.Fatal(err)
	}
	dsn := "sqlite://" + tmp + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		_ = os.RemoveAll(tmp)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = database.Close()
		// Retry: a leaked goroutine may briefly recreate files.
		deadline := time.Now().Add(2 * time.Second)
		for {
			if err := os.RemoveAll(tmp); err == nil {
				return
			}
			if time.Now().After(deadline) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	return database, dsn
}

func newTestApp(t *testing.T) *echo.Echo {
	t.Helper()
	database, dsn := newTestDB(t)
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(nil, nil, c)
	return api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, noopChecker())
}

func TestAuthStatus_NotInitialized(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/status", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rec.Code)
	}
	var body map[string]any
	json.NewDecoder(rec.Body).Decode(&body)
	if body["initialized"] != false {
		t.Errorf("want initialized=false, got %v", body["initialized"])
	}
}

func TestAuthSetup_CreatesUser(t *testing.T) {
	e := newTestApp(t)
	body := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["token"] == nil {
		t.Error("want token in response")
	}
}

func TestAuthSetup_AlreadyInitialized(t *testing.T) {
	e := newTestApp(t)
	body := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	for range 2 {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		e.ServeHTTP(httptest.NewRecorder(), req)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d", rec.Code)
	}
}

func TestAuthLogin_Success(t *testing.T) {
	e := newTestApp(t)
	setup := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setup))
	req.Header.Set("Content-Type", "application/json")
	e.ServeHTTP(httptest.NewRecorder(), req)

	loginBody := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(loginBody))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec2.Code, rec2.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec2.Body).Decode(&resp)
	if resp["token"] == nil {
		t.Error("want token in response")
	}
	if resp["user"] == nil {
		t.Error("want user in response")
	}
}

func TestAuthLogin_WrongPassword(t *testing.T) {
	e := newTestApp(t)
	setup := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setup))
	req.Header.Set("Content-Type", "application/json")
	e.ServeHTTP(httptest.NewRecorder(), req)

	loginBody := `{"username":"admin","password":"wrongpass"}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(loginBody))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rec2.Code)
	}
}

func TestAuthLogin_EmptyCredentials(t *testing.T) {
	e := newTestApp(t)
	for _, body := range []string{
		`{"username":"","password":"password123"}`,
		`{"username":"admin","password":""}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: want 400 got %d", body, rec.Code)
		}
	}
}

func TestAuthMe_RequiresToken(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rec.Code)
	}
}

func TestAuthMe_WithValidToken(t *testing.T) {
	e := newTestApp(t)
	// Create user via setup
	setup := `{"username":"admin","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setup))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var setupResp map[string]any
	json.NewDecoder(rec.Body).Decode(&setupResp)
	token, _ := setupResp["token"].(string)

	// Call /me with the token
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec2.Code, rec2.Body.String())
	}
	var meResp map[string]any
	json.NewDecoder(rec2.Body).Decode(&meResp)
	if meResp["username"] != "admin" {
		t.Errorf("want username=admin, got %v", meResp["username"])
	}
}
