package api_test

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/metadata"
)

// newAvatarTestApp is newTestApp with a DataDir, which is where avatars land.
func newAvatarTestApp(t *testing.T) (*echo.Echo, string) {
	t.Helper()
	database, dsn := newTestDB(t)
	dataDir := t.TempDir()
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn, DataDir: dataDir}
	c := cache.New("")
	return api.NewRouter(api.Deps{
		Config: cfg, DB: database, Cache: c, Metadata: metadata.New(nil, nil, c), UpdateChecker: noopChecker(),
	}), dataDir
}

func testPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func multipartUpload(t *testing.T, e *echo.Echo, token string, payload []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", "avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/auth/me/avatar", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestAvatar_UploadFetchDelete(t *testing.T) {
	e, _ := newAvatarTestApp(t)
	token := getToken(t, e)

	rec := multipartUpload(t, e, token, testPNG(t, 300, 200))
	if rec.Code != http.StatusOK {
		t.Fatalf("upload: want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(resp.AvatarURL, "/api/v1/users/") || !strings.Contains(resp.AvatarURL, "/avatar?v=") {
		t.Fatalf("unexpected avatar_url %q", resp.AvatarURL)
	}

	// /auth/me carries the same URL.
	me := makeAuthRequest(t, e, http.MethodGet, "/api/v1/auth/me", "")
	meRec := httptest.NewRecorder()
	e.ServeHTTP(meRec, me)
	var meResp map[string]any
	_ = json.Unmarshal(meRec.Body.Bytes(), &meResp)
	if meResp["avatar_url"] != resp.AvatarURL {
		t.Errorf("/auth/me avatar_url = %v, want %s", meResp["avatar_url"], resp.AvatarURL)
	}

	// Public fetch, no auth, both sizes, ETag + 304.
	for _, size := range []string{"", "?size=128"} {
		url := strings.SplitN(resp.AvatarURL, "?", 2)[0] + size
		req := httptest.NewRequest(http.MethodGet, url, nil)
		get := httptest.NewRecorder()
		e.ServeHTTP(get, req)
		if get.Code != http.StatusOK || get.Header().Get("Content-Type") != "image/jpeg" {
			t.Fatalf("GET %s: %d %s", url, get.Code, get.Header().Get("Content-Type"))
		}
		if get.Header().Get("ETag") == "" || !strings.Contains(get.Header().Get("Cache-Control"), "max-age=86400") {
			t.Errorf("GET %s missing cache headers: %v", url, get.Header())
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(get.Body.Bytes()))
		if err != nil {
			t.Fatalf("GET %s body is not an image: %v", url, err)
		}
		want := 512
		if size != "" {
			want = 128
		}
		if cfg.Width != want || cfg.Height != want {
			t.Errorf("GET %s: %dx%d, want %d²", url, cfg.Width, cfg.Height, want)
		}
		again := httptest.NewRequest(http.MethodGet, url, nil)
		again.Header.Set("If-None-Match", get.Header().Get("ETag"))
		rec304 := httptest.NewRecorder()
		e.ServeHTTP(rec304, again)
		if rec304.Code != http.StatusNotModified {
			t.Errorf("If-None-Match: want 304, got %d", rec304.Code)
		}
	}

	del := makeAuthRequest(t, e, http.MethodDelete, "/api/v1/auth/me/avatar", "")
	delRec := httptest.NewRecorder()
	e.ServeHTTP(delRec, del)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", delRec.Code)
	}
	gone := httptest.NewRecorder()
	e.ServeHTTP(gone, httptest.NewRequest(http.MethodGet, strings.SplitN(resp.AvatarURL, "?", 2)[0], nil))
	if gone.Code != http.StatusNotFound {
		t.Errorf("after delete: want 404, got %d", gone.Code)
	}
}

func TestAvatar_SourceURL(t *testing.T) {
	e, _ := newAvatarTestApp(t)
	token := getToken(t, e)
	payload := testPNG(t, 64, 64)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	req := httptest.NewRequest(http.MethodPut, "/api/v1/auth/me/avatar", strings.NewReader(`{"source_url":"`+srv.URL+`/pic.png"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("source_url: want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	bad := httptest.NewRequest(http.MethodPut, "/api/v1/auth/me/avatar", strings.NewReader(`{"source_url":"ftp://example/x.png"}`))
	bad.Header.Set("Content-Type", "application/json")
	bad.Header.Set("Authorization", "Bearer "+token)
	badRec := httptest.NewRecorder()
	e.ServeHTTP(badRec, bad)
	if badRec.Code != http.StatusBadRequest {
		t.Errorf("ftp source_url: want 400, got %d", badRec.Code)
	}
}

func TestAvatar_RejectsOversizeAndNonImages(t *testing.T) {
	e, _ := newAvatarTestApp(t)
	token := getToken(t, e)

	big := make([]byte, 2<<20+1)
	if rec := multipartUpload(t, e, token, big); rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("3 MB upload: want 413, got %d", rec.Code)
	}
	if rec := multipartUpload(t, e, token, []byte("definitely not an image")); rec.Code != http.StatusBadRequest {
		t.Errorf("text upload: want 400, got %d", rec.Code)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/nobody/avatar", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown user: want 404, got %d", rec.Code)
	}
}
