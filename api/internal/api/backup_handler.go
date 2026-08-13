package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/backup"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/store"
)

// ─── Request / Response types ───────────────────────────────────────────────

type backupConfigPayload struct {
	URL       string `json:"url,omitempty"`
	Username  string `json:"username,omitempty"`
	Password  string `json:"password,omitempty"`
	Endpoint  string `json:"endpoint,omitempty"`
	Bucket    string `json:"bucket,omitempty"`
	AccessKey string `json:"access_key,omitempty"`
	SecretKey string `json:"secret_key,omitempty"`
	Region    string `json:"region,omitempty"`
}

type backupConfigRequest struct {
	Type    string              `json:"type"` // "webdav" or "s3"
	Config  backupConfigPayload `json:"config"`
	Enabled bool                `json:"enabled"`
}

type backupConfigResponse struct {
	ID         string              `json:"id"`
	Type       string              `json:"type"`
	Config     backupConfigPayload `json:"config"`
	Enabled    bool                `json:"enabled"`
	LastSyncAt *string             `json:"last_sync_at"`
}

type backupTestConnectionRequest struct {
	Type   string              `json:"type"`
	Config backupConfigPayload `json:"config"`
}

type syncResult struct {
	Type    string `json:"type"`
	Status  string `json:"status"` // "ok" or "error"
	Message string `json:"message,omitempty"`
}

// ─── Handlers ───────────────────────────────────────────────────────────────

// PUT /api/v1/user/preferences/backup-config
func (h *handler) handleUpsertBackupConfig(c *echo.Context) error {
	userID := getUserID(c)

	var req backupConfigRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.Type != "webdav" && req.Type != "s3" {
		return echo.NewHTTPError(http.StatusBadRequest, "type must be 'webdav' or 's3'")
	}

	// Serialize and encrypt config.
	configJSON, err := json.Marshal(req.Config)
	if err != nil {
		return echo.ErrInternalServerError
	}

	encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
	if err != nil {
		return echo.ErrInternalServerError
	}

	var enabled int64
	if req.Enabled {
		enabled = 1
	}

	row, err := h.queries.UpsertBackupConfig(c.Request().Context(), store.UpsertBackupConfigParams{
		ID:      uuid.New().String(),
		UserID:  userID,
		Type:    req.Type,
		Config:  encrypted,
		Enabled: enabled,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, toBackupConfigResponse(row, req.Config))
}

// GET /api/v1/user/preferences/backup-config
func (h *handler) handleListBackupConfigs(c *echo.Context) error {
	userID := getUserID(c)

	rows, err := h.queries.ListBackupConfigs(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	out := make([]backupConfigResponse, 0, len(rows))
	for _, row := range rows {
		cfg, _ := decryptBackupConfig(h.encryptionKey, row.Config)
		masked := maskSensitiveFields(cfg, row.Type)
		out = append(out, toBackupConfigResponse(row, masked))
	}

	return c.JSON(http.StatusOK, out)
}

// DELETE /api/v1/user/preferences/backup-config/:type
func (h *handler) handleDeleteBackupConfig(c *echo.Context) error {
	userID := getUserID(c)
	cfgType := c.Param("type")

	if cfgType != "webdav" && cfgType != "s3" {
		return echo.NewHTTPError(http.StatusBadRequest, "type must be 'webdav' or 's3'")
	}

	err := h.queries.DeleteBackupConfig(c.Request().Context(), store.DeleteBackupConfigParams{
		UserID: userID,
		Type:   cfgType,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/user/preferences/backup-config/test
func (h *handler) handleTestBackupConnection(c *echo.Context) error {
	var req backupTestConnectionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	var testErr error
	switch req.Type {
	case "webdav":
		testErr = backup.TestWebDAV(req.Config.URL, req.Config.Username, req.Config.Password)
	case "s3":
		testErr = backup.TestS3(req.Config.Endpoint, req.Config.Bucket, req.Config.AccessKey, req.Config.SecretKey, req.Config.Region)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "type must be 'webdav' or 's3'")
	}

	if testErr != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"ok":    false,
			"error": testErr.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"ok": true,
	})
}

// POST /api/v1/user/preferences/sync
func (h *handler) handleTriggerSync(c *echo.Context) error {
	userID := getUserID(c)
	ctx := c.Request().Context()

	// Get all user preferences and export as JSON.
	prefs, err := h.queries.GetAllUserPreferences(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	exported := make([]exportedPreference, len(prefs))
	for i, p := range prefs {
		exported[i] = exportedPreference{
			Scope:     p.Scope,
			ScopeID:   p.ScopeID,
			Data:      json.RawMessage(p.Data),
			UpdatedAt: p.UpdatedAt,
		}
	}

	payload := exportPreferencesResponse{
		Version:     1,
		Preferences: exported,
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Get all enabled backup configs.
	configs, err := h.queries.ListBackupConfigs(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	var results []syncResult
	for _, row := range configs {
		if row.Enabled == 0 {
			continue
		}

		cfg, decErr := decryptBackupConfig(h.encryptionKey, row.Config)
		if decErr != nil {
			results = append(results, syncResult{
				Type:    row.Type,
				Status:  "error",
				Message: "failed to decrypt config",
			})
			continue
		}

		var uploadErr error
		switch row.Type {
		case "webdav":
			uploadErr = backup.UploadWebDAV(cfg.URL, cfg.Username, cfg.Password, data)
		case "s3":
			uploadErr = backup.UploadS3(cfg.Endpoint, cfg.Bucket, cfg.AccessKey, cfg.SecretKey, cfg.Region, data)
		}

		if uploadErr != nil {
			results = append(results, syncResult{
				Type:    row.Type,
				Status:  "error",
				Message: uploadErr.Error(),
			})
			continue
		}

		// Update last_sync_at.
		if err := h.queries.UpdateBackupSyncTime(ctx, store.UpdateBackupSyncTimeParams{
			UserID: userID,
			Type:   row.Type,
		}); err != nil {
			slog.Warn("backup: update sync time", "type", row.Type, "err", err)
		}

		results = append(results, syncResult{
			Type:   row.Type,
			Status: "ok",
		})
	}

	return c.JSON(http.StatusOK, results)
}

// GET /api/v1/user/preferences/sync/status
func (h *handler) handleSyncStatus(c *echo.Context) error {
	userID := getUserID(c)

	configs, err := h.queries.ListBackupConfigs(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	type statusEntry struct {
		Type       string  `json:"type"`
		Enabled    bool    `json:"enabled"`
		LastSyncAt *string `json:"last_sync_at"`
	}

	out := make([]statusEntry, 0, len(configs))
	for _, row := range configs {
		var syncAt *string
		if row.LastSyncAt.Valid {
			syncAt = &row.LastSyncAt.String
		}
		out = append(out, statusEntry{
			Type:       row.Type,
			Enabled:    row.Enabled == 1,
			LastSyncAt: syncAt,
		})
	}

	return c.JSON(http.StatusOK, out)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func decryptBackupConfig(key []byte, encrypted string) (backupConfigPayload, error) {
	var cfg backupConfigPayload
	plaintext, err := crypto.Decrypt(key, encrypted)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal([]byte(plaintext), &cfg)
	return cfg, err
}

func maskSensitiveFields(cfg backupConfigPayload, cfgType string) backupConfigPayload {
	masked := cfg
	switch cfgType {
	case "webdav":
		if masked.Password != "" {
			masked.Password = maskString(masked.Password)
		}
	case "s3":
		if masked.SecretKey != "" {
			masked.SecretKey = maskString(masked.SecretKey)
		}
	}
	return masked
}

func maskString(s string) string {
	if len(s) <= 4 {
		return strings.Repeat("*", len(s))
	}
	return strings.Repeat("*", len(s)-4) + s[len(s)-4:]
}

func toBackupConfigResponse(row store.BackupConfig, cfg backupConfigPayload) backupConfigResponse {
	var syncAt *string
	if row.LastSyncAt.Valid {
		syncAt = &row.LastSyncAt.String
	}
	return backupConfigResponse{
		ID:         row.ID,
		Type:       row.Type,
		Config:     cfg,
		Enabled:    row.Enabled == 1,
		LastSyncAt: syncAt,
	}
}
