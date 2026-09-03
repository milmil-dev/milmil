package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"uuid"

	"github.com/labstack/echo/v5"

	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/jellyfin"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/services"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/updatecheck"
	"github.com/milmil/api/internal/worker"
	"github.com/milmil/api/migrations"
)

func servicesTestChecker() *updatecheck.Checker {
	return updatecheck.NewChecker(updatecheck.Config{Repo: "test/test", BaseURL: "http://127.0.0.1:0", TTL: time.Hour})
}

type servicesTestEnv struct {
	e     *echo.Echo
	q     *store.Queries
	jobs  *worker.JobRegistry
	jf    *jellyfin.Handler
	token string
}

func newServicesTestEnv(t *testing.T) *servicesTestEnv {
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
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	jobs := worker.NewJobRegistry()
	jf, err := jellyfin.NewHandler(q, cfg.JWTSecret, t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	e := NewRouter(Deps{
		Config: cfg, DB: database, Cache: c, Metadata: metadata.New(nil, nil, c), UpdateChecker: servicesTestChecker(),
		Jobs: jobs, Jellyfin: jf,
	})

	user, err := q.CreateUser(context.Background(), store.CreateUserParams{ID: uuid.New().String(), Username: "svc-admin", PasswordHash: "unused"})
	if err != nil {
		t.Fatal(err)
	}
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := q.CreateAPIToken(context.Background(), store.CreateAPITokenParams{
		ID: uuid.New().String(), Name: "test", TokenHash: hash, TokenPrefix: prefix, UserID: user.ID,
		LastIp: "127.0.0.1", LastUserAgent: "test",
	}); err != nil {
		t.Fatal(err)
	}
	return &servicesTestEnv{e: e, q: q, jobs: jobs, jf: jf, token: plaintext}
}

func (env *servicesTestEnv) do(t *testing.T, method, path, body string) (int, map[string]any) {
	t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer "+env.token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	env.e.ServeHTTP(rec, req)
	var out map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
	}
	return rec.Code, out
}

func serviceByID(t *testing.T, body map[string]any, id string) map[string]any {
	t.Helper()
	list, _ := body["services"].([]any)
	for _, item := range list {
		m, _ := item.(map[string]any)
		if m["id"] == id {
			return m
		}
	}
	t.Fatalf("service %q not in %v", id, body)
	return nil
}

func TestServices_ListIncludesJobsJellyfinAndSystem(t *testing.T) {
	env := newServicesTestEnv(t)
	env.jobs.Register("rss_refresh", 5*time.Minute, func(context.Context) error { return nil })
	env.jobs.Register("download_sync", 3*time.Second, func(context.Context) error { return nil })

	code, body := env.do(t, http.MethodGet, "/api/v1/system/services", "")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	rss := serviceByID(t, body, "worker.rss_refresh")
	if rss["kind"] != "worker" || rss["name"] != "RSS refresh" || rss["controllable"] != true || rss["runnable"] != true || rss["enabled"] != true {
		t.Fatalf("rss = %v", rss)
	}
	if rss["interval_seconds"].(float64) != 300 || rss["summary"] != "Every 5 min" {
		t.Fatalf("rss schedule = %v", rss)
	}
	if core := serviceByID(t, body, "worker.download_sync"); core["controllable"] != false {
		t.Fatalf("core worker must not be controllable: %v", core)
	}
	jf := serviceByID(t, body, "jellyfin")
	extra := jf["extra"].(map[string]any)
	if jf["kind"] != "api" || jf["enabled"] != true || extra["address"] != "http://example.com/jellyfin" || extra["discovery_port"].(float64) != 7359 {
		t.Fatalf("jellyfin = %v", jf)
	}
	for _, id := range []string{"downloader", "transcode_cache", "sync", "backup", "bot.telegram", "bot.discord"} {
		serviceByID(t, body, id)
	}
	system := body["system"].(map[string]any)
	if system["version"] == "" || system["started_at"] == "" {
		t.Fatalf("system = %v", system)
	}
}

func TestServices_PatchTogglesWorkerAndPersists(t *testing.T) {
	env := newServicesTestEnv(t)
	env.jobs.Register("rss_refresh", 5*time.Minute, func(context.Context) error { return nil })
	env.jobs.Register("download_sync", 3*time.Second, func(context.Context) error { return nil })

	code, body := env.do(t, http.MethodPatch, "/api/v1/system/services/worker.rss_refresh", `{"enabled":false}`)
	if code != http.StatusOK || body["enabled"] != false {
		t.Fatalf("patch = %d %v", code, body)
	}
	if env.jobs.Enabled("rss_refresh") {
		t.Fatalf("registry still enabled")
	}
	settings, err := services.Load(context.Background(), env.q)
	if err != nil || !settings.IsDisabled("worker.rss_refresh") {
		t.Fatalf("settings = %+v err=%v", settings, err)
	}
	if code, _ := env.do(t, http.MethodPatch, "/api/v1/system/services/worker.rss_refresh", `{"enabled":true}`); code != http.StatusOK {
		t.Fatalf("re-enable = %d", code)
	}
	settings, _ = services.Load(context.Background(), env.q)
	if settings.IsDisabled("worker.rss_refresh") || !env.jobs.Enabled("rss_refresh") {
		t.Fatalf("re-enable not applied: %+v", settings)
	}
	if code, _ := env.do(t, http.MethodPatch, "/api/v1/system/services/worker.download_sync", `{"enabled":false}`); code != http.StatusBadRequest {
		t.Fatalf("core worker patch = %d, want 400", code)
	}
	if code, _ := env.do(t, http.MethodPatch, "/api/v1/system/services/worker.nope", `{"enabled":false}`); code != http.StatusNotFound {
		t.Fatalf("unknown worker patch = %d, want 404", code)
	}
	if code, _ := env.do(t, http.MethodPatch, "/api/v1/system/services/transcode_cache", `{"enabled":false}`); code != http.StatusBadRequest {
		t.Fatalf("daemon patch = %d, want 400", code)
	}
}

func TestServices_PatchJellyfinAndBots(t *testing.T) {
	env := newServicesTestEnv(t)
	code, body := env.do(t, http.MethodPatch, "/api/v1/system/services/jellyfin", `{"enabled":false}`)
	if code != http.StatusOK || body["enabled"] != false || env.jf.Enabled() {
		t.Fatalf("jellyfin off = %d %v enabled=%v", code, body, env.jf.Enabled())
	}
	req := httptest.NewRequest(http.MethodGet, "/jellyfin/System/Info/Public", nil)
	rec := httptest.NewRecorder()
	env.e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("jellyfin route while disabled = %d", rec.Code)
	}
	settings, _ := services.Load(context.Background(), env.q)
	if settings.JellyfinEnabled() {
		t.Fatalf("jellyfin flag not persisted: %+v", settings)
	}

	code, body = env.do(t, http.MethodPatch, "/api/v1/system/services/bot.telegram", `{"enabled":true}`)
	if code != http.StatusOK || body["enabled"] != true {
		t.Fatalf("telegram on = %d %v", code, body)
	}
	if code, body := env.do(t, http.MethodGet, "/api/v1/system/services", ""); code != http.StatusOK || serviceByID(t, body, "bot.telegram")["enabled"] != true {
		t.Fatalf("telegram flag not reflected: %v", body)
	}
}

func TestServices_RunJobOnceAtATime(t *testing.T) {
	env := newServicesTestEnv(t)
	started := make(chan struct{})
	release := make(chan struct{})
	env.jobs.Register("library_reconcile", time.Hour, func(context.Context) error {
		close(started)
		<-release
		return nil
	})

	code, body := env.do(t, http.MethodPost, "/api/v1/system/services/worker.library_reconcile/run", "")
	if code != http.StatusAccepted || body["started"] != true {
		t.Fatalf("run = %d %v", code, body)
	}
	<-started
	if code, _ := env.do(t, http.MethodPost, "/api/v1/system/services/worker.library_reconcile/run", ""); code != http.StatusConflict {
		t.Fatalf("second run = %d, want 409", code)
	}
	close(release)
	deadline := time.Now().Add(2 * time.Second)
	for {
		if state, _ := env.jobs.Get("library_reconcile"); !state.Running {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("job did not finish")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if code, _ := env.do(t, http.MethodPost, "/api/v1/system/services/transcode_cache/run", ""); code != http.StatusBadRequest {
		t.Fatalf("non-runnable = %d, want 400", code)
	}
	if code, _ := env.do(t, http.MethodPost, "/api/v1/system/services/worker.nope/run", ""); code != http.StatusNotFound {
		t.Fatalf("unknown = %d, want 404", code)
	}
}

func TestServices_JellyfinDevices(t *testing.T) {
	env := newServicesTestEnv(t)
	code, body := env.do(t, http.MethodGet, "/api/v1/system/services/jellyfin/devices", "")
	if code != http.StatusOK || len(body["devices"].([]any)) != 0 {
		t.Fatalf("empty list = %d %v", code, body)
	}
	if code, _ := env.do(t, http.MethodDelete, "/api/v1/system/services/jellyfin/devices/none", ""); code != http.StatusNotFound {
		t.Fatalf("revoke unknown = %d", code)
	}
	// A device that signed in through the Jellyfin layer shows up and can be revoked.
	hash, _ := auth.HashPassword("correct horse battery")
	if _, err := env.q.CreateUser(context.Background(), store.CreateUserParams{ID: uuid.New().String(), Username: "infuse", PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(`{"Username":"infuse","Pw":"correct horse battery"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Client="Infuse", Device="iPad", DeviceId="ipad-1", Version="7"`)
	rec := httptest.NewRecorder()
	env.e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("jellyfin sign-in = %d %s", rec.Code, rec.Body.String())
	}
	code, body = env.do(t, http.MethodGet, "/api/v1/system/services/jellyfin/devices", "")
	devices := body["devices"].([]any)
	if code != http.StatusOK || len(devices) != 1 || devices[0].(map[string]any)["client"] != "Infuse" {
		t.Fatalf("devices = %d %v", code, body)
	}
	if code, _ := env.do(t, http.MethodDelete, "/api/v1/system/services/jellyfin/devices/ipad-1", ""); code != http.StatusNoContent {
		t.Fatalf("revoke = %d", code)
	}
	_, body = env.do(t, http.MethodGet, "/api/v1/system/services/jellyfin/devices", "")
	if body["devices"].([]any)[0].(map[string]any)["revoked"] != true {
		t.Fatalf("not revoked: %v", body)
	}
}
