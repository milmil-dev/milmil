package api_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/migrations"
)

func newTestAppWithDB(t *testing.T) (*echo.Echo, *sql.DB) {
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
	return api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil), database
}

func TestStreamDirect_NotFound(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/stream/nonexistent/direct", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStreamDirect_Success(t *testing.T) {
	e, database := newTestAppWithDB(t)

	// Create a user via setup so we can get auth
	token := getToken(t, e)

	// Create a temp video file
	dir := t.TempDir()
	videoPath := filepath.Join(dir, "test.mp4")
	if err := os.WriteFile(videoPath, []byte("fake video content"), 0644); err != nil {
		t.Fatal(err)
	}

	// Insert a library and media file record directly
	libID := "test-lib-id"
	fileID := "test-file-id"
	_, err := database.Exec(
		`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES (?, ?, ?, 1, 60)`,
		libID, "TestLib", dir,
	)
	if err != nil {
		t.Fatal(err)
	}
	_, err = database.Exec(
		`INSERT INTO media_files (id, library_id, path, filename, size_bytes) VALUES (?, ?, ?, ?, ?)`,
		fileID, libID, videoPath, "test.mp4", 18,
	)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+fileID+"/direct", nil)
	req.Header.Set("Authorization", "Bearer "+token)
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
