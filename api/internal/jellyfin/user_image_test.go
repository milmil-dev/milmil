package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"uuid"

	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

func TestUserImage_ServesAvatarAndTagsUser(t *testing.T) {
	h, e, q := newDevicesTestHandler(t)
	hash, _ := auth.HashPassword("correct horse battery")
	user, err := q.CreateUser(context.Background(), store.CreateUserParams{ID: uuid.New().String(), Username: "infuse-user", PasswordHash: hash})
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	h.SetAvatarDir(dir)

	// No avatar yet: no tag, 404 image.
	token := signIn(t, e, "dev-1", "Infuse", "Apple TV")
	encoded := EncodeItemID("user", user.ID)
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "MediaBrowser Token=\""+token+"\"")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}
	if rec := get("/jellyfin/Users/" + encoded + "/Images/Primary"); rec.Code != http.StatusNotFound {
		t.Fatalf("before avatar: want 404, got %d", rec.Code)
	}

	// Render an avatar the way the main API would.
	img := image.NewRGBA(image.Rect(0, 0, 512, 512))
	for i := range img.Pix {
		img.Pix[i] = 200
	}
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	f, err := os.Create(filepath.Join(dir, user.ID+"-512.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	_ = jpeg.Encode(f, img, nil)
	_ = f.Close()
	if err := q.SetUserAvatar(context.Background(), store.SetUserAvatarParams{
		AvatarPath:      sql.NullString{String: filepath.Join(dir, user.ID+"-512.jpg"), Valid: true},
		AvatarUpdatedAt: sql.NullString{String: "2026-08-26T10:00:00Z", Valid: true},
		ID:              user.ID,
	}); err != nil {
		t.Fatal(err)
	}

	rec := get("/jellyfin/Users/" + encoded + "/Images/Primary?tag=20260826T100000Z")
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("image: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if _, _, err := image.DecodeConfig(rec.Body); err != nil {
		t.Fatalf("image body: %v", err)
	}

	userRec := get("/jellyfin/Users/" + encoded)
	var dto UserDTO
	if err := json.Unmarshal(userRec.Body.Bytes(), &dto); err != nil {
		t.Fatal(err)
	}
	if dto.PrimaryImageTag != "20260826T100000Z" {
		t.Errorf("PrimaryImageTag = %q", dto.PrimaryImageTag)
	}
}
