package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

// newThumbnailTestApp builds a router whose DataDir is an absolute temp path
// — the shape every real deployment has (DATA_DIR=/data) and the one Echo's
// c.File cannot serve from — with one local media file and a token for it.
func newThumbnailTestApp(t *testing.T) (e *echo.Echo, dataDir, fileID, token string) {
	t.Helper()
	database, dsn := newTestDB(t)
	dataDir = t.TempDir()
	require.True(t, filepath.IsAbs(dataDir))
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn, DataDir: dataDir}
	c := cache.New("")
	e = api.NewRouter(api.Deps{
		Config: cfg, DB: database, Cache: c, Metadata: metadata.New(nil, nil, c), UpdateChecker: noopChecker(),
	})

	q := store.New(database)
	ctx := context.Background()
	user, err := q.CreateUser(ctx, store.CreateUserParams{ID: uuid.NewString(), Username: "thumbs", PasswordHash: "unused"})
	require.NoError(t, err)
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	require.NoError(t, err)
	_, err = q.CreateAPIToken(ctx, store.CreateAPITokenParams{
		ID: uuid.NewString(), Name: "thumbs", TokenHash: hash, TokenPrefix: prefix, UserID: user.ID,
	})
	require.NoError(t, err)

	lib, err := q.CreateLibrary(ctx, store.CreateLibraryParams{
		ID: uuid.NewString(), Name: "lib", Path: dataDir, Enabled: 1, ScanIntervalMinutes: 60, SourceType: "local",
	})
	require.NoError(t, err)
	mf, err := q.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
		ID: uuid.NewString(), LibraryID: lib.ID, Path: filepath.Join(dataDir, "ep.mkv"), Filename: "ep.mkv", SizeBytes: 1,
	})
	require.NoError(t, err)
	return e, dataDir, mf.ID, plaintext
}

func TestThumbnailVTT_ServesCachedTrackFromAbsoluteDataDir(t *testing.T) {
	e, dataDir, fileID, token := newThumbnailTestApp(t)
	cacheDir := filepath.Join(dataDir, "thumbnails", fileID)
	require.NoError(t, os.MkdirAll(cacheDir, 0o755))
	vtt := "WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nsprite.jpg#xywh=0,0,160,90\n\n"
	require.NoError(t, os.WriteFile(filepath.Join(cacheDir, "thumbnails.vtt"), []byte(vtt), 0o644))
	sprite := []byte{0xFF, 0xD8, 0xFF, 0xD9}
	require.NoError(t, os.WriteFile(filepath.Join(cacheDir, "sprite.jpg"), sprite, 0o644))

	// The player fetches the track with the token in the query, like <track src>.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+fileID+"/thumbnails?token="+token, nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())
	require.Equal(t, vtt, rec.Body.String())
	require.Contains(t, rec.Header().Get(echo.HeaderContentType), "text/vtt")

	req = httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+fileID+"/sprite.jpg", nil)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())
	require.Equal(t, sprite, rec.Body.Bytes())
	require.Equal(t, "image/jpeg", rec.Header().Get(echo.HeaderContentType))
}

func TestThumbnailSprite_NotGeneratedYet(t *testing.T) {
	e, _, fileID, _ := newThumbnailTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+fileID+"/sprite.jpg", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestThumbnailVTT_UnknownFile(t *testing.T) {
	e, _, _, token := newThumbnailTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+uuid.NewString()+"/thumbnails", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}
