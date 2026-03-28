package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path"
	"time"

	"github.com/google/uuid"
	smb2 "github.com/hirochachacha/go-smb2"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type createLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type updateLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	Enabled             bool                   `json:"enabled"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type testConnectionRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

func (h *handler) handleListLibraries(c echo.Context) error {
	libs, err := h.queries.ListLibrariesWithStats(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, libs)
}

func (h *handler) handleGetLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibraryWithStats(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, lib)
}

func (h *handler) handleCreateLibrary(c echo.Context) error {
	var req createLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	var encryptedConfig sql.NullString

	if sourceType == "local" {
		// For local sources, validate the path exists on disk.
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
	} else {
		// For remote sources, encrypt the source config.
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}

	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.CreateLibrary(c.Request().Context(), store.CreateLibraryParams{
		ID:                    uuid.NewString(),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               1,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, lib)
}

func (h *handler) handleUpdateLibrary(c echo.Context) error {
	var req updateLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	var encryptedConfig sql.NullString

	if sourceType == "local" {
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
	} else {
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}

	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.UpdateLibrary(c.Request().Context(), store.UpdateLibraryParams{
		ID:                    c.Param("id"),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               enabled,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, lib)
}

func (h *handler) handleDeleteLibrary(c echo.Context) error {
	if err := h.queries.DeleteLibrary(c.Request().Context(), c.Param("id")); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleScanLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	// Decrypt source config for network storage providers; local libraries use empty config.
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return echo.ErrInternalServerError
		}
		configJSON = decrypted
	}
	sc := scanner.New(h.queries)
	if err := sc.ScanLibrary(c.Request().Context(), lib, configJSON); err != nil {
		return echo.ErrInternalServerError
	}
	// Auto-match after scan (non-fatal if matcher is nil or fails)
	if h.matcher != nil {
		_, _ = h.matcher.MatchLibrary(c.Request().Context(), lib.ID)
	}
	// Resolve anime metadata after matching (non-fatal if resolver is nil or fails)
	if h.resolver != nil {
		_, _ = h.resolver.ResolveLibrary(c.Request().Context(), lib.ID)
	}
	if h.wsHub != nil {
		h.wsHub.Broadcast(ws.Event{Type: "scan:completed", Data: map[string]any{"library_id": lib.ID, "library_name": lib.Name}})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleListScanSummaries(c echo.Context) error {
	summaries, err := h.queries.ListScanSummaries(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, summaries)
}

func (h *handler) handleTestConnection(c echo.Context) error {
	var req testConnectionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	configJSON, _ := json.Marshal(req.SourceConfig)
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
	}
	defer provider.Close()

	if req.Path != "" {
		if _, statErr := provider.Stat(req.Path); statErr != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": statErr.Error()})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}

// ─── Browse directories ─────────────────────────────────────────────────────

type browseRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

type browseEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type browseResponse struct {
	Directories []browseEntry `json:"directories"`
}

func (h *handler) handleBrowse(c echo.Context) error {
	var req browseRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	// For SMB: if share is empty, list available shares on the host instead of directories.
	if req.SourceType == "smb" {
		configJSON, _ := json.Marshal(req.SourceConfig)
		var cfg storage.RcloneConfig
		if err := json.Unmarshal(configJSON, &cfg); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		if cfg.Share == "" {
			shares := listSMBSharesWithCredentials(
				c.Request().Context(),
				cfg.Host, cfg.Port,
				cfg.Username, cfg.Password, cfg.Domain,
			)
			dirs := make([]browseEntry, 0, len(shares))
			for _, s := range shares {
				dirs = append(dirs, browseEntry{Name: s, Path: s})
			}
			return c.JSON(http.StatusOK, browseResponse{Directories: dirs})
		}
	}

	configJSON, _ := json.Marshal(req.SourceConfig)
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	defer provider.Close()

	browsePath := req.Path
	if browsePath == "" {
		browsePath = "/"
	}

	entries, err := provider.ReadDir(browsePath)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	dirs := make([]browseEntry, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			entryPath := path.Join(browsePath, entry.Name())
			dirs = append(dirs, browseEntry{
				Name: entry.Name(),
				Path: entryPath,
			})
		}
	}

	return c.JSON(http.StatusOK, browseResponse{Directories: dirs})
}

// listSMBSharesWithCredentials lists SMB shares on a host using provided credentials.
func listSMBSharesWithCredentials(ctx context.Context, host string, port int, username, password, domain string) []string {
	if host == "" {
		return nil
	}
	if port == 0 {
		port = 445
	}
	addr := fmt.Sprintf("%s:%d", host, port)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	d := net.Dialer{Timeout: 3 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil
	}

	initiator := &smb2.NTLMInitiator{
		User:     username,
		Password: password,
		Domain:   domain,
	}
	smbDialer := &smb2.Dialer{Initiator: initiator}

	s, err := smbDialer.DialContext(ctx, conn)
	if err != nil {
		conn.Close()
		return nil
	}

	names, err := s.ListSharenames()
	s.Logoff()
	conn.Close()

	if err != nil {
		return nil
	}

	var shares []string
	for _, name := range names {
		if len(name) > 0 && name[len(name)-1] != '$' {
			shares = append(shares, name)
		}
	}
	return shares
}
