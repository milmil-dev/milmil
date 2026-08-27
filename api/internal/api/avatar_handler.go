package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // avatar uploads
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // avatar uploads
)

const (
	avatarUploadLimit = 2 << 20 // multipart body
	avatarFetchLimit  = 5 << 20 // source_url body
	avatarLarge       = 512
	avatarSmall       = 128
)

var avatarSizes = []int{avatarLarge, avatarSmall}

// avatarDir is where the rendered avatar JPEGs live: <DataDir>/avatars.
func (h *handler) avatarDir() string {
	base := h.cfg.DataDir
	if base == "" {
		base = filepath.Join(os.TempDir(), "milmil")
	}
	return filepath.Join(base, "avatars")
}

func avatarFileName(userID string, size int) string {
	return fmt.Sprintf("%s-%d.jpg", userID, size)
}

// avatarURL is the public, cache-busted URL clients embed; nil when the user
// has no avatar.
func avatarURL(user store.User) *string {
	if !user.AvatarPath.Valid || user.AvatarPath.String == "" {
		return nil
	}
	v := "0"
	if user.AvatarUpdatedAt.Valid {
		if t, err := time.Parse(time.RFC3339, user.AvatarUpdatedAt.String); err == nil {
			v = strconv.FormatInt(t.Unix(), 10)
		}
	}
	s := fmt.Sprintf("/api/v1/users/%s/avatar?v=%s", user.ID, v)
	return &s
}

type avatarSourceRequest struct {
	SourceURL string `json:"source_url"`
}

type avatarResponse struct {
	AvatarURL string `json:"avatar_url"`
}

// handlePutAvatar accepts a multipart `file` (png / jpeg / webp, ≤ 2 MB) or a
// JSON `source_url` the server fetches, centre-crops it square and stores a
// 512² and a 128² JPEG under DataDir/avatars.
func (h *handler) handlePutAvatar(c *echo.Context) error {
	userID := getUserID(c)
	raw, err := h.readAvatarSource(c)
	if err != nil {
		return err
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported image")
	}
	square := centreCrop(img)
	dir := h.avatarDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return echo.ErrInternalServerError
	}
	for _, size := range avatarSizes {
		if err := writeAvatarJPEG(filepath.Join(dir, avatarFileName(userID, size)), square, size); err != nil {
			return echo.ErrInternalServerError
		}
	}
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	if err := h.queries.SetUserAvatar(c.Request().Context(), store.SetUserAvatarParams{
		AvatarPath:      sql.NullString{String: filepath.Join(dir, avatarFileName(userID, avatarLarge)), Valid: true},
		AvatarUpdatedAt: sql.NullString{String: updatedAt, Valid: true},
		ID:              userID,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	user, err := h.queries.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, avatarResponse{AvatarURL: *avatarURL(user)})
}

// readAvatarSource returns the raw image bytes from either request shape.
func (h *handler) readAvatarSource(c *echo.Context) ([]byte, error) {
	mediaType, _, _ := mime.ParseMediaType(c.Request().Header.Get("Content-Type"))
	if strings.HasPrefix(mediaType, "multipart/") {
		file, header, err := c.Request().FormFile("file")
		if err != nil {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "missing file field")
		}
		defer file.Close()
		if header.Size > avatarUploadLimit {
			return nil, echo.NewHTTPError(http.StatusRequestEntityTooLarge, "avatar must be 2 MB or smaller")
		}
		raw, err := io.ReadAll(io.LimitReader(file, avatarUploadLimit+1))
		if err != nil {
			return nil, echo.ErrInternalServerError
		}
		if len(raw) > avatarUploadLimit {
			return nil, echo.NewHTTPError(http.StatusRequestEntityTooLarge, "avatar must be 2 MB or smaller")
		}
		if !allowedAvatarType(http.DetectContentType(raw)) {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "avatar must be PNG, JPEG or WebP")
		}
		return raw, nil
	}

	var req avatarSourceRequest
	if err := json.NewDecoder(io.LimitReader(c.Request().Body, 4096)).Decode(&req); err != nil || req.SourceURL == "" {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "send a multipart file or a source_url")
	}
	parsed, err := url.Parse(req.SourceURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "source_url must be an http(s) URL")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(parsed.String())
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadGateway, "could not fetch source_url")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("source_url answered %d", resp.StatusCode))
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, avatarFetchLimit+1))
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadGateway, "could not read source_url")
	}
	if len(raw) > avatarFetchLimit {
		return nil, echo.NewHTTPError(http.StatusRequestEntityTooLarge, "source image must be 5 MB or smaller")
	}
	if !allowedAvatarType(http.DetectContentType(raw)) {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "source_url must be a PNG, JPEG or WebP image")
	}
	return raw, nil
}

func allowedAvatarType(detected string) bool {
	switch detected {
	case "image/png", "image/jpeg", "image/webp":
		return true
	}
	return false
}

func centreCrop(img image.Image) image.Image {
	b := img.Bounds()
	side := min(b.Dx(), b.Dy())
	x0 := b.Min.X + (b.Dx()-side)/2
	y0 := b.Min.Y + (b.Dy()-side)/2
	rect := image.Rect(x0, y0, x0+side, y0+side)
	out := image.NewRGBA(image.Rect(0, 0, side, side))
	draw.Draw(out, out.Bounds(), img, rect.Min, draw.Src)
	return out
}

func writeAvatarJPEG(path string, square image.Image, size int) error {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.CatmullRom.Scale(dst, dst.Bounds(), square, square.Bounds(), draw.Over, nil)
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(f, dst, &jpeg.Options{Quality: 85}); err != nil {
		f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func (h *handler) handleDeleteAvatar(c *echo.Context) error {
	userID := getUserID(c)
	for _, size := range avatarSizes {
		_ = os.Remove(filepath.Join(h.avatarDir(), avatarFileName(userID, size)))
	}
	if err := h.queries.ClearUserAvatar(c.Request().Context(), userID); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

// handleGetUserAvatar is public: user ids are UUIDs and an avatar is not a
// secret, and <img> / external players cannot send a bearer header.
func (h *handler) handleGetUserAvatar(c *echo.Context) error {
	user, err := h.queries.GetUserByID(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "no avatar")
		}
		return echo.ErrInternalServerError
	}
	if !user.AvatarPath.Valid || user.AvatarPath.String == "" {
		return echo.NewHTTPError(http.StatusNotFound, "no avatar")
	}
	size := avatarLarge
	if c.QueryParam("size") == strconv.Itoa(avatarSmall) {
		size = avatarSmall
	}
	return serveAvatarFile(c, filepath.Join(h.avatarDir(), avatarFileName(user.ID, size)), user.AvatarUpdatedAt.String)
}

func serveAvatarFile(c *echo.Context, path, updatedAt string) error {
	f, err := os.Open(path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "no avatar")
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}
	etag := `"` + strings.ReplaceAll(updatedAt, ":", "") + `"`
	if etag == `""` {
		etag = `"` + strconv.FormatInt(stat.ModTime().Unix(), 10) + `"`
	}
	res := c.Response()
	res.Header().Set("Cache-Control", "public, max-age=86400")
	res.Header().Set("ETag", etag)
	res.Header().Set("Content-Type", "image/jpeg")
	if c.Request().Header.Get("If-None-Match") == etag {
		return c.NoContent(http.StatusNotModified)
	}
	http.ServeContent(res, c.Request(), filepath.Base(path), stat.ModTime(), f)
	return nil
}
