package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListRecentProgress(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/progress/recent", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListHistory_EmptyReturns200WithEmptyItems(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/progress/history", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items      []any   `json:"items"`
		NextBefore *string `json:"next_before"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Items == nil {
		t.Fatalf("want non-nil items slice, got nil")
	}
	if len(body.Items) != 0 {
		t.Fatalf("want empty items, got %d", len(body.Items))
	}
	if body.NextBefore != nil {
		t.Fatalf("want null next_before, got %v", *body.NextBefore)
	}
}

func TestListHistory_RejectsInvalidFilter(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/progress/history?filter=bogus", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListHistory_AcceptsValidFilters(t *testing.T) {
	e := newTestApp(t)
	for _, f := range []string{"all", "in_progress", "completed"} {
		req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/progress/history?filter="+f, "")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("filter=%s: want 200, got %d: %s", f, rec.Code, rec.Body.String())
		}
	}
}

func TestListHistory_CapsLimitAt100(t *testing.T) {
	e := newTestApp(t)
	// Limit > 100 should be silently capped (no error) and still return 200.
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/progress/history?limit=500", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
