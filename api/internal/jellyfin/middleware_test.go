package jellyfin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

func newTestQueries(t *testing.T) *store.Queries {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	return store.New(database)
}

func seedUser(t *testing.T, q *store.Queries, username string) store.User {
	t.Helper()
	hash, err := auth.HashPassword("Tr0ub4dor-correct-horse!")
	if err != nil {
		t.Fatal(err)
	}
	user, err := q.CreateUser(context.Background(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: hash,
	})
	if err != nil {
		t.Fatal(err)
	}
	return user
}

// serveWithToken runs one request through the middleware and reports the
// status and body the handler produced.
func serveWithToken(t *testing.T, q *store.Queries, secret, header, token string) (int, string) {
	t.Helper()
	e := echo.New()
	e.GET("/test", func(c *echo.Context) error {
		uid := c.Get("userID").(string)
		return c.String(http.StatusOK, uid)
	}, EmbyAuthMiddleware(secret, q))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	if token != "" {
		req.Header.Set(header, `MediaBrowser Token="`+token+`"`)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func TestEmbyAuthMiddleware_ValidToken(t *testing.T) {
	secret := "testsecret32chars!!!"
	q := newTestQueries(t)
	user := seedUser(t, q, "alice")

	token, err := auth.SignToken(secret, user.ID, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}

	code, body := serveWithToken(t, q, secret, "X-Emby-Authorization", token)
	if code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", code, body)
	}
	if body != user.ID {
		t.Errorf("want %s, got %s", user.ID, body)
	}
}

func TestEmbyAuthMiddleware_AuthorizationHeader(t *testing.T) {
	secret := "testsecret32chars!!!"
	q := newTestQueries(t)
	user := seedUser(t, q, "bob")

	token, err := auth.SignToken(secret, user.ID, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}

	code, body := serveWithToken(t, q, secret, "Authorization", token)
	if code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", code, body)
	}
}

func TestEmbyAuthMiddleware_NoToken(t *testing.T) {
	q := newTestQueries(t)
	code, _ := serveWithToken(t, q, "secret", "Authorization", "")
	if code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestEmbyAuthMiddleware_WrongSecret(t *testing.T) {
	q := newTestQueries(t)
	user := seedUser(t, q, "carol")

	token, err := auth.SignToken("some-other-secret", user.ID, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}

	code, _ := serveWithToken(t, q, "testsecret32chars!!!", "Authorization", token)
	if code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

// A correctly signed token must stop working once the user's token version
// moves on — this is what makes a password change log external players out.
func TestEmbyAuthMiddleware_StaleTokenVersion(t *testing.T) {
	secret := "testsecret32chars!!!"
	q := newTestQueries(t)
	user := seedUser(t, q, "dave")

	token, err := auth.SignToken(secret, user.ID, user.TokenVersion)
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := serveWithToken(t, q, secret, "Authorization", token); code != http.StatusOK {
		t.Fatalf("token should start out valid, got %d", code)
	}

	if err := q.BumpTokenVersion(context.Background(), user.ID); err != nil {
		t.Fatal(err)
	}

	code, _ := serveWithToken(t, q, secret, "Authorization", token)
	if code != http.StatusUnauthorized {
		t.Fatalf("want 401 after version bump, got %d", code)
	}
}

func TestEmbyAuthMiddleware_UnknownUser(t *testing.T) {
	secret := "testsecret32chars!!!"
	q := newTestQueries(t)

	token, err := auth.SignToken(secret, "no-such-user", 0)
	if err != nil {
		t.Fatal(err)
	}

	code, _ := serveWithToken(t, q, secret, "Authorization", token)
	if code != http.StatusUnauthorized {
		t.Fatalf("want 401 for deleted user, got %d", code)
	}
}
