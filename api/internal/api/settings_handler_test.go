package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/store"
)

func TestGetSettings(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/settings", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetSettingsIncludesTMDBAPIKeySection(t *testing.T) {
	e, database := newTestAppWithDB(t)
	_, err := store.New(database).UpsertSetting(context.Background(), store.UpsertSettingParams{
		Key:   "tmdb_api_key",
		Value: `{"api_key":"tmdb-test-key"}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/settings", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if _, ok := body["tmdb_api_key"]; !ok {
		t.Fatalf("want tmdb_api_key in settings response, got keys %v", body)
	}
	var tmdbSettings struct {
		APIKey string `json:"api_key"`
	}
	if err := json.Unmarshal(body["tmdb_api_key"], &tmdbSettings); err != nil {
		t.Fatal(err)
	}
	if tmdbSettings.APIKey != "tmdb-test-key" {
		t.Fatalf("want tmdb-test-key, got %q", tmdbSettings.APIKey)
	}
}
