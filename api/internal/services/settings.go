// Package services holds the persisted on/off state of the backend's managed
// services (scheduler jobs, the Jellyfin layer) — the "services" settings
// section that Settings › 服務 edits.
package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"

	"github.com/milmil/api/internal/store"
)

// SettingsKey is the settings-table row the section lives in.
const SettingsKey = "services"

// Settings is the stored document. Everything is enabled unless listed here.
type Settings struct {
	// Disabled holds service IDs ("worker.rss_refresh", "bot.telegram"…).
	Disabled []string         `json:"disabled"`
	Jellyfin JellyfinSettings `json:"jellyfin"`
}

// JellyfinSettings gates the Jellyfin-compatible API and its LAN discovery.
// Pointers so an absent field means "default on".
type JellyfinSettings struct {
	Enabled          *bool `json:"enabled,omitempty"`
	DiscoveryEnabled *bool `json:"discovery_enabled,omitempty"`
}

// IsDisabled reports whether a service ID is in the disabled list.
func (s Settings) IsDisabled(id string) bool {
	return slices.Contains(s.Disabled, id)
}

// SetDisabled adds or removes an ID from the disabled list.
func (s *Settings) SetDisabled(id string, disabled bool) {
	if disabled {
		if !s.IsDisabled(id) {
			s.Disabled = append(s.Disabled, id)
		}
		return
	}
	s.Disabled = slices.DeleteFunc(s.Disabled, func(v string) bool { return v == id })
}

// JellyfinEnabled defaults to true.
func (s Settings) JellyfinEnabled() bool {
	return s.Jellyfin.Enabled == nil || *s.Jellyfin.Enabled
}

// DiscoveryEnabled defaults to true.
func (s Settings) DiscoveryEnabled() bool {
	return s.Jellyfin.DiscoveryEnabled == nil || *s.Jellyfin.DiscoveryEnabled
}

// Load reads the section; a missing row is the all-enabled default.
func Load(ctx context.Context, q *store.Queries) (Settings, error) {
	var s Settings
	row, err := q.GetSetting(ctx, SettingsKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return s, nil
		}
		return s, err
	}
	if err := json.Unmarshal([]byte(row.Value), &s); err != nil {
		return Settings{}, err
	}
	if s.Disabled == nil {
		s.Disabled = []string{}
	}
	return s, nil
}

// Save writes the section back.
func Save(ctx context.Context, q *store.Queries, s Settings) error {
	if s.Disabled == nil {
		s.Disabled = []string{}
	}
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	_, err = q.UpsertSetting(ctx, store.UpsertSettingParams{Key: SettingsKey, Value: string(data)})
	return err
}
