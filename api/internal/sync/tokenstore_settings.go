package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/milmil/api/internal/store"
)

// SettingsTokenStore reads and writes tokens against the settings table.
// userID is not yet used as a key — settings are global per provider today —
// but the interface keeps userID so multi-user support is a clean extension.
type SettingsTokenStore struct {
	q *store.Queries
}

func NewSettingsTokenStore(q *store.Queries) *SettingsTokenStore {
	return &SettingsTokenStore{q: q}
}

type tokenPayload struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in,omitempty"`
	ExpiresAt    string `json:"expires_at,omitempty"`
}

func (s *SettingsTokenStore) Get(ctx context.Context, _ string, p ProviderName) (string, string, error) {
	setting, err := s.q.GetSetting(ctx, string(p)+"_token")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", ErrNoToken
		}
		return "", "", err
	}
	var tp tokenPayload
	if err := json.Unmarshal([]byte(setting.Value), &tp); err != nil {
		return "", "", fmt.Errorf("token payload: %w", err)
	}
	if tp.AccessToken == "" {
		return "", "", ErrNoToken
	}
	return tp.AccessToken, tp.RefreshToken, nil
}

func (s *SettingsTokenStore) Put(ctx context.Context, _ string, p ProviderName, access, refresh string, expiresAt time.Time) error {
	tp := tokenPayload{AccessToken: access, RefreshToken: refresh}
	if !expiresAt.IsZero() {
		tp.ExpiresAt = expiresAt.UTC().Format(time.RFC3339)
	}
	payload, err := json.Marshal(tp)
	if err != nil {
		return err
	}
	_, err = s.q.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   string(p) + "_token",
		Value: string(payload),
	})
	return err
}

type credsPayload struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

func (s *SettingsTokenStore) LoadCreds(ctx context.Context, p ProviderName) (OAuthCreds, error) {
	setting, err := s.q.GetSetting(ctx, string(p)+"_oauth")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return OAuthCreds{}, fmt.Errorf("sync: no %s OAuth creds configured", p)
		}
		return OAuthCreds{}, err
	}
	var cp credsPayload
	if err := json.Unmarshal([]byte(setting.Value), &cp); err != nil {
		return OAuthCreds{}, fmt.Errorf("creds payload: %w", err)
	}
	if cp.ClientID == "" {
		return OAuthCreds{}, fmt.Errorf("sync: empty client id for %s", p)
	}
	return OAuthCreds{ClientID: cp.ClientID, ClientSecret: cp.ClientSecret}, nil
}
