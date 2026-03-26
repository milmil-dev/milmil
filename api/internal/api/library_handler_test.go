package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListLibraries_Empty(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/libraries", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec.Code, rec.Body.String())
	}
	var body []any
	json.NewDecoder(rec.Body).Decode(&body)
	if len(body) != 0 {
		t.Errorf("want empty list, got %d items", len(body))
	}
}

func TestCreateLibrary_Success(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()
	body := `{"name":"Anime","path":"` + dir + `","scan_interval_minutes":120}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", body)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d: %s", rec.Code, rec.Body.String())
	}
	var lib map[string]any
	json.NewDecoder(rec.Body).Decode(&lib)
	if lib["name"] != "Anime" {
		t.Errorf("want name=Anime, got %v", lib["name"])
	}
}

func TestCreateLibrary_MissingFields(t *testing.T) {
	e := newTestApp(t)
	for _, body := range []string{
		`{"name":"","path":"/tmp"}`,
		`{"name":"Anime","path":""}`,
	} {
		req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", body)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: want 400 got %d", body, rec.Code)
		}
	}
}

func TestCreateLibrary_PathNotExist(t *testing.T) {
	e := newTestApp(t)
	body := `{"name":"Anime","path":"/nonexistent/path/abc123"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", body)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetLibrary_NotFound(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/libraries/nonexistent-id", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 got %d", rec.Code)
	}
}

func TestUpdateLibrary_Success(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()

	// Create
	createBody := `{"name":"Anime","path":"` + dir + `"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", createBody)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var lib map[string]any
	json.NewDecoder(rec.Body).Decode(&lib)
	id, _ := lib["id"].(string)

	// Update
	updateBody := `{"name":"Movies","path":"` + dir + `","enabled":true,"scan_interval_minutes":30}`
	req2 := makeAuthRequest(t, e, http.MethodPut, "/api/v1/libraries/"+id, updateBody)
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec2.Code, rec2.Body.String())
	}
	var updated map[string]any
	json.NewDecoder(rec2.Body).Decode(&updated)
	if updated["name"] != "Movies" {
		t.Errorf("want name=Movies, got %v", updated["name"])
	}
}

func TestDeleteLibrary_Success(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()

	// Create
	createBody := `{"name":"Anime","path":"` + dir + `"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", createBody)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var lib map[string]any
	json.NewDecoder(rec.Body).Decode(&lib)
	id, _ := lib["id"].(string)

	// Delete
	req2 := makeAuthRequest(t, e, http.MethodDelete, "/api/v1/libraries/"+id, "")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusNoContent {
		t.Fatalf("want 204 got %d", rec2.Code)
	}
}

func TestScanLibrary_Success(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()

	// Create library
	createBody := `{"name":"Anime","path":"` + dir + `"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", createBody)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var lib map[string]any
	json.NewDecoder(rec.Body).Decode(&lib)
	id, _ := lib["id"].(string)

	// Trigger scan
	req2 := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries/"+id+"/scan", "")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusNoContent {
		t.Fatalf("want 204 got %d: %s", rec2.Code, rec2.Body.String())
	}
}

