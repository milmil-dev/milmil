package jellyfin

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
)

func TestEmbyAuthMiddleware_ValidToken(t *testing.T) {
	secret := "testsecret32chars!!!"
	token, _ := auth.SignToken(secret, "user-123")

	e := echo.New()
	e.GET("/test", func(c *echo.Context) error {
		uid := c.Get("userID").(string)
		return c.String(http.StatusOK, uid)
	}, EmbyAuthMiddleware(secret))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "user-123" {
		t.Errorf("want user-123, got %s", rec.Body.String())
	}
}

func TestEmbyAuthMiddleware_AuthorizationHeader(t *testing.T) {
	secret := "testsecret32chars!!!"
	token, _ := auth.SignToken(secret, "user-456")

	e := echo.New()
	e.GET("/test", func(c *echo.Context) error {
		uid := c.Get("userID").(string)
		return c.String(http.StatusOK, uid)
	}, EmbyAuthMiddleware(secret))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEmbyAuthMiddleware_NoToken(t *testing.T) {
	e := echo.New()
	e.GET("/test", func(c *echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, EmbyAuthMiddleware("secret"))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}
