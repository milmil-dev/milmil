package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

func newTestApp(t *testing.T) *echo.Echo {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(nil, nil, c)
	return api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil, nil, nil)
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
	body := `{"username":"admin","password":"password123"}`
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
	body := `{"username":"admin","password":"password123"}`
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
	setup := `{"username":"admin","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setup))
	req.Header.Set("Content-Type", "application/json")
	e.ServeHTTP(httptest.NewRecorder(), req)

	loginBody := `{"username":"admin","password":"password123"}`
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
	setup := `{"username":"admin","password":"password123"}`
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
	setup := `{"username":"admin","password":"password123"}`
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
