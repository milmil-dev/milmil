package jellyfin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
)

func newDevicesTestHandler(t *testing.T) (*Handler, *echo.Echo, *store.Queries) {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	q := store.New(database)
	h, err := NewHandler(q, "testsecret32chars!!!", t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	e := echo.New()
	h.RegisterRoutes(e)
	return h, e, q
}

func signIn(t *testing.T, e *echo.Echo, deviceID, client, device string) string {
	t.Helper()
	body := `{"Username":"infuse-user","Pw":"correct horse battery"}`
	req := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Client="`+client+`", Device="`+device+`", DeviceId="`+deviceID+`", Version="1"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("auth status = %d body=%s", rec.Code, rec.Body.String())
	}
	var resp AuthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	return resp.AccessToken
}

func TestDevices_RecordedOnSignInAndRevocable(t *testing.T) {
	h, e, q := newDevicesTestHandler(t)
	hash, _ := auth.HashPassword("correct horse battery")
	if _, err := q.CreateUser(context.Background(), store.CreateUserParams{ID: uuid.NewString(), Username: "infuse-user", PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}

	token := signIn(t, e, "dev-1", "Infuse", "Living Room Apple TV")

	devices, err := h.ListDevices(context.Background())
	if err != nil || len(devices) != 1 || devices[0].Client != "Infuse" || devices[0].DeviceName != "Living Room Apple TV" || devices[0].Revoked {
		t.Fatalf("devices = %+v err=%v", devices, err)
	}
	if h.DeviceCount(context.Background()) != 1 {
		t.Fatalf("count = %d", h.DeviceCount(context.Background()))
	}

	authed := func() int {
		req := httptest.NewRequest(http.MethodGet, "/jellyfin/System/Info", nil)
		req.Header.Set("X-Emby-Authorization", `MediaBrowser Token="`+token+`", Client="Infuse", DeviceId="dev-1"`)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := authed(); code != http.StatusOK {
		t.Fatalf("authed request before revoke = %d", code)
	}

	revoked, err := h.RevokeDevice(context.Background(), "dev-1")
	if err != nil || !revoked {
		t.Fatalf("revoke = %v err=%v", revoked, err)
	}
	if code := authed(); code != http.StatusUnauthorized {
		t.Fatalf("authed request after revoke = %d, want 401", code)
	}
	if revoked, _ := h.RevokeDevice(context.Background(), "nope"); revoked {
		t.Fatalf("unknown device reported revoked")
	}

	// Signing in again with the password is a fresh login: un-revoked.
	token = signIn(t, e, "dev-1", "Infuse", "Living Room Apple TV")
	if code := authed(); code != http.StatusOK {
		t.Fatalf("authed request after re-login = %d", code)
	}
}

func TestDisabledLayerAnswers503(t *testing.T) {
	h, e, _ := newDevicesTestHandler(t)
	h.SetEnabled(false)
	req := httptest.NewRequest(http.MethodGet, "/jellyfin/System/Info/Public", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("disabled status = %d", rec.Code)
	}
	h.SetEnabled(true)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("enabled status = %d", rec.Code)
	}
}
