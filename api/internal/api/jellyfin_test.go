package api_test

import (
	"encoding/json"
	"fmt"
	"github.com/milmil/api/internal/jellyfin"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// jellyfinAuthHeader returns the X-Emby-Authorization header value for the given token.
func jellyfinAuthHeader(token string) string {
	return fmt.Sprintf(`MediaBrowser Token="%s"`, token)
}

// getJellyfinToken creates a milmil user and authenticates via Jellyfin to return an access token.
func getJellyfinToken(t *testing.T, e interface {
	ServeHTTP(http.ResponseWriter, *http.Request)
}) string {
	t.Helper()

	// Create user via milmil setup
	setupBody := `{"username":"testuser","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setupBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	// 201 = created, 403 = already initialized (both fine)

	// Authenticate via Jellyfin
	authBody := `{"Username":"testuser","Pw":"Tr0ub4dor&3xplod3"}`
	req2 := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(authBody))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("getJellyfinToken: authenticate returned %d: %s", rec2.Code, rec2.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec2.Body).Decode(&resp); err != nil {
		t.Fatalf("getJellyfinToken: decode response: %v", err)
	}
	token, _ := resp["AccessToken"].(string)
	if token == "" {
		t.Fatalf("getJellyfinToken: empty AccessToken in response: %v", resp)
	}
	return token
}

// TestJellyfin_SystemInfoPublic verifies /jellyfin/System/Info/Public requires no auth
// and returns a valid product name and version.
func TestJellyfin_SystemInfoPublic(t *testing.T) {
	e := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/System/Info/Public", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["ProductName"] != "milmil" {
		t.Errorf("want ProductName=milmil, got %v", resp["ProductName"])
	}
	version, _ := resp["Version"].(string)
	if version == "" {
		t.Errorf("want non-empty Version, got empty")
	}
}

// TestJellyfin_AuthenticateByName verifies that Jellyfin auth returns a token and user name.
func TestJellyfin_AuthenticateByName(t *testing.T) {
	e := newTestApp(t)

	// Create user
	setupBody := `{"username":"testuser","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setupBody))
	req.Header.Set("Content-Type", "application/json")
	e.ServeHTTP(httptest.NewRecorder(), req)

	// Authenticate via Jellyfin
	authBody := `{"Username":"testuser","Pw":"Tr0ub4dor&3xplod3"}`
	req2 := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(authBody))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec2.Code, rec2.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec2.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	token, _ := resp["AccessToken"].(string)
	if token == "" {
		t.Errorf("want non-empty AccessToken, got empty")
	}

	user, _ := resp["User"].(map[string]any)
	if user == nil {
		t.Fatalf("want User object, got nil")
	}
	if user["Name"] != "testuser" {
		t.Errorf("want User.Name=testuser, got %v", user["Name"])
	}
}

// TestJellyfin_AuthenticateByName_WrongPassword verifies that wrong credentials return 401.
func TestJellyfin_AuthenticateByName_WrongPassword(t *testing.T) {
	e := newTestApp(t)

	// Create user
	setupBody := `{"username":"testuser","password":"Tr0ub4dor&3xplod3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(setupBody))
	req.Header.Set("Content-Type", "application/json")
	e.ServeHTTP(httptest.NewRecorder(), req)

	// Authenticate with wrong password
	authBody := `{"Username":"testuser","Pw":"wrongpassword"}`
	req2 := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(authBody))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d: %s", rec2.Code, rec2.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec2.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["Message"] != "Invalid username or password" {
		t.Errorf("want Message=Invalid username or password, got %v", resp["Message"])
	}
}

// TestJellyfin_BrowseLibrary verifies that /jellyfin/Items returns anime items for a library.
func TestJellyfin_BrowseLibrary(t *testing.T) {
	e, database := newTestAppWithDB(t)

	token := getJellyfinToken(t, e)

	// Insert test library and anime
	libID := "test-lib"
	_, err := database.Exec(
		`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES (?, ?, ?, 1, 60)`,
		libID, "Anime", "/media/anime",
	)
	if err != nil {
		t.Fatalf("insert library: %v", err)
	}
	_, err = database.Exec(
		`INSERT INTO anime (id, library_id, title, status, genres, score) VALUES (?, ?, ?, ?, ?, ?)`,
		"anime-1", libID, "進擊的巨人", "completed", `["Action","Fantasy"]`, 8.5,
	)
	if err != nil {
		t.Fatalf("insert anime: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/Items", nil)
	req.Header.Set("X-Emby-Authorization", jellyfinAuthHeader(token))
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	items, _ := resp["Items"].([]any)
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d: %v", len(items), resp)
	}

	item, _ := items[0].(map[string]any)
	if item["Name"] != "進擊的巨人" {
		t.Errorf("want Name=進擊的巨人, got %v", item["Name"])
	}
	if item["Type"] != "Series" {
		t.Errorf("want Type=Series, got %v", item["Type"])
	}
}

// TestJellyfin_StreamDirect verifies that a file can be streamed via the Jellyfin API.
func TestJellyfin_StreamDirect(t *testing.T) {
	e, database := newTestAppWithDB(t)

	token := getJellyfinToken(t, e)

	// Create a temp video file
	dir := t.TempDir()
	videoPath := filepath.Join(dir, "test.mp4")
	if err := os.WriteFile(videoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatal(err)
	}

	// Insert library and media file
	libID := "test-lib-stream"
	fileID := "test-file-stream"
	_, err := database.Exec(
		`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES (?, ?, ?, 1, 60)`,
		libID, "StreamLib", dir,
	)
	if err != nil {
		t.Fatalf("insert library: %v", err)
	}
	_, err = database.Exec(
		`INSERT INTO media_files (id, library_id, path, filename, size_bytes) VALUES (?, ?, ?, ?, ?)`,
		fileID, libID, videoPath, "test.mp4", 18,
	)
	if err != nil {
		t.Fatalf("insert media_file: %v", err)
	}

	// Encode the file ID as Jellyfin item ID: base64url("file:<fileID>")
	encodedID := jellyfin.EncodeItemID("file", fileID)

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/Videos/"+encodedID+"/stream", nil)
	req.Header.Set("X-Emby-Authorization", jellyfinAuthHeader(token))
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "video/mp4" {
		t.Errorf("want Content-Type video/mp4, got %s", ct)
	}
}

// TestJellyfin_UnimplementedEndpoint verifies that unknown endpoints return 501.
func TestJellyfin_UnimplementedEndpoint(t *testing.T) {
	e := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/SomeUnknown/Endpoint", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("want 501, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["Message"] != "Not implemented" {
		t.Errorf("want Message=Not implemented, got %v", resp["Message"])
	}
}
