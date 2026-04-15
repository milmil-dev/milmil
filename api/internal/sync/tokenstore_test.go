package sync

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/milmil/api/internal/store"
)

func seedOAuthCreds(t *testing.T, q *store.Queries, provider string, id, secret string) {
	t.Helper()
	payload, _ := json.Marshal(map[string]string{"client_id": id, "client_secret": secret})
	_, err := q.UpsertSetting(context.Background(), store.UpsertSettingParams{
		Key:   provider + "_oauth",
		Value: string(payload),
	})
	if err != nil {
		t.Fatal(err)
	}
}

func seedToken(t *testing.T, q *store.Queries, provider string, access, refresh string) {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{
		"access_token":  access,
		"refresh_token": refresh,
		"expires_in":    3600,
	})
	_, err := q.UpsertSetting(context.Background(), store.UpsertSettingParams{
		Key:   provider + "_token",
		Value: string(payload),
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSettingsTokenStoreGet(t *testing.T) {
	q, _, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	seedToken(t, q, "anilist", "access1", "refresh1")

	ts := NewSettingsTokenStore(q)
	a, r, err := ts.Get(context.Background(), "u", ProviderAniList)
	if err != nil {
		t.Fatal(err)
	}
	if a != "access1" || r != "refresh1" {
		t.Errorf("got (%q, %q)", a, r)
	}
}

func TestSettingsTokenStoreGetMissing(t *testing.T) {
	q, _, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	ts := NewSettingsTokenStore(q)
	_, _, err := ts.Get(context.Background(), "u", ProviderAniList)
	if err != ErrNoToken {
		t.Errorf("want ErrNoToken, got %v", err)
	}
}

func TestSettingsTokenStorePutRoundTrip(t *testing.T) {
	q, _, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	ts := NewSettingsTokenStore(q)

	exp := time.Now().Add(time.Hour).UTC()
	if err := ts.Put(context.Background(), "u", ProviderAniList, "a2", "r2", exp); err != nil {
		t.Fatal(err)
	}
	a, r, err := ts.Get(context.Background(), "u", ProviderAniList)
	if err != nil {
		t.Fatal(err)
	}
	if a != "a2" || r != "r2" {
		t.Errorf("round-trip lost: (%q, %q)", a, r)
	}
}

func TestSettingsTokenStoreLoadCreds(t *testing.T) {
	q, _, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	seedOAuthCreds(t, q, "bangumi", "cid", "sec")

	ts := NewSettingsTokenStore(q)
	creds, err := ts.LoadCreds(context.Background(), ProviderBangumi)
	if err != nil {
		t.Fatal(err)
	}
	if creds.ClientID != "cid" || creds.ClientSecret != "sec" {
		t.Errorf("bad creds: %+v", creds)
	}
}

func TestSettingsTokenStoreLoadCredsMissing(t *testing.T) {
	q, _, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	ts := NewSettingsTokenStore(q)
	_, err := ts.LoadCreds(context.Background(), ProviderAniList)
	if err == nil {
		t.Fatal("expected error")
	}
}
