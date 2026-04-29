package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/store"
)

// seedSetupAdmin inserts a user row directly. We don't care about a usable
// password hash for these read-only tests; we only need users.count > 0.
func seedSetupAdmin(t *testing.T, db *sql.DB, username string) {
	t.Helper()
	q := store.New(db)
	_, err := q.CreateUser(context.Background(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: "unused-hash",
	})
	if err != nil {
		t.Fatalf("seedSetupAdmin: %v", err)
	}
}

// seedSetupLibrary inserts a library row via the store layer. Bypasses the
// create handler's path-exists validation since we only need libraries.count > 0.
func seedSetupLibrary(t *testing.T, db *sql.DB, name, path string) {
	t.Helper()
	q := store.New(db)
	_, err := q.CreateLibrary(context.Background(), store.CreateLibraryParams{
		ID:                  uuid.NewString(),
		Name:                name,
		Path:                path,
		Enabled:             1,
		ScanIntervalMinutes: 60,
		SourceType:          "local",
	})
	if err != nil {
		t.Fatalf("seedSetupLibrary: %v", err)
	}
}

func TestSetupStatus(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name       string
		seed       func(*testing.T, *sql.DB)
		wantAdmin  bool
		wantLibCnt int
	}{
		{
			name:       "fresh DB",
			seed:       func(_ *testing.T, _ *sql.DB) {},
			wantAdmin:  false,
			wantLibCnt: 0,
		},
		{
			name: "admin only",
			seed: func(t *testing.T, db *sql.DB) {
				seedSetupAdmin(t, db, "admin")
			},
			wantAdmin:  true,
			wantLibCnt: 0,
		},
		{
			name: "admin + one library",
			seed: func(t *testing.T, db *sql.DB) {
				seedSetupAdmin(t, db, "admin")
				seedSetupLibrary(t, db, "Anime", "/media/anime")
			},
			wantAdmin:  true,
			wantLibCnt: 1,
		},
		{
			name: "no admin + multiple libraries",
			seed: func(t *testing.T, db *sql.DB) {
				seedSetupLibrary(t, db, "Anime", "/media/anime")
				seedSetupLibrary(t, db, "Movies", "/media/movies")
			},
			wantAdmin:  false,
			wantLibCnt: 2,
		},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e, db := newTestAppWithDB(t)
			tc.seed(t, db)

			req := httptest.NewRequest(http.MethodGet, "/api/v1/setup/status", nil)
			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status: got %d want 200, body=%s", rec.Code, rec.Body.String())
			}
			var got struct {
				HasAdmin     bool `json:"has_admin"`
				LibraryCount int  `json:"library_count"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if got.HasAdmin != tc.wantAdmin {
				t.Errorf("has_admin: got %v want %v", got.HasAdmin, tc.wantAdmin)
			}
			if got.LibraryCount != tc.wantLibCnt {
				t.Errorf("library_count: got %d want %d", got.LibraryCount, tc.wantLibCnt)
			}
		})
	}

	t.Run("no auth required", func(t *testing.T) {
		t.Parallel()
		e, _ := newTestAppWithDB(t)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/setup/status", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code == http.StatusUnauthorized {
			t.Fatal("expected public route, got 401")
		}
	})
}
