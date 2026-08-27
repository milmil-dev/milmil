package jellyfin

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/milmil/api/internal/store"
)

// deviceTracker remembers the external players that signed in and answers
// "is this device revoked?" cheaply: the middleware runs on every stream
// chunk request, so revocation state is cached for a minute and last_seen is
// written at most once a minute per device.
type deviceTracker struct {
	queries *store.Queries
	mu      sync.Mutex
	revoked map[string]revokedEntry
	touched map[string]time.Time
	now     func() time.Time
}

type revokedEntry struct {
	revoked   bool
	checkedAt time.Time
}

const deviceCacheTTL = time.Minute

func newDeviceTracker(queries *store.Queries) *deviceTracker {
	return &deviceTracker{queries: queries, revoked: map[string]revokedEntry{}, touched: map[string]time.Time{}, now: time.Now}
}

// record upserts the device on a successful sign-in (a revoked device that
// authenticates again with the password is un-revoked: that is a new login).
func (d *deviceTracker) record(ctx context.Context, userID, deviceID, client, deviceName string) {
	if deviceID == "" {
		return
	}
	now := d.now().UTC().Format(time.RFC3339)
	if _, err := d.queries.UpsertExternalDevice(ctx, store.UpsertExternalDeviceParams{
		DeviceID: deviceID, UserID: userID, Client: client, DeviceName: deviceName, FirstSeen: now, LastSeen: now,
	}); err != nil {
		// The device id comes straight off the MediaBrowser auth header, so it
		// is not logged: the error is what makes this line worth keeping.
		slog.Warn("jellyfin: record device", "err", err)
		return
	}
	d.mu.Lock()
	d.revoked[deviceID] = revokedEntry{revoked: false, checkedAt: d.now()}
	d.touched[deviceID] = d.now()
	d.mu.Unlock()
}

// isRevoked answers from the cache when fresh, else from the database.
func (d *deviceTracker) isRevoked(ctx context.Context, deviceID string) bool {
	if deviceID == "" {
		return false
	}
	d.mu.Lock()
	entry, ok := d.revoked[deviceID]
	d.mu.Unlock()
	if ok && d.now().Sub(entry.checkedAt) < deviceCacheTTL {
		return entry.revoked
	}
	row, err := d.queries.GetExternalDevice(ctx, deviceID)
	revoked := false
	if err == nil {
		revoked = row.Revoked != 0
	} else if !errors.Is(err, sql.ErrNoRows) {
		slog.Debug("jellyfin: device lookup", "err", err)
	}
	d.mu.Lock()
	d.revoked[deviceID] = revokedEntry{revoked: revoked, checkedAt: d.now()}
	d.mu.Unlock()
	return revoked
}

// touch bumps last_seen, at most once per minute per device.
func (d *deviceTracker) touch(ctx context.Context, deviceID string) {
	if deviceID == "" {
		return
	}
	d.mu.Lock()
	last, ok := d.touched[deviceID]
	if ok && d.now().Sub(last) < deviceCacheTTL {
		d.mu.Unlock()
		return
	}
	d.touched[deviceID] = d.now()
	d.mu.Unlock()
	_ = d.queries.TouchExternalDevice(ctx, store.TouchExternalDeviceParams{
		LastSeen: d.now().UTC().Format(time.RFC3339), DeviceID: deviceID,
	})
}

// revoke marks the device and drops it from the cache so the next request
// sees the change immediately.
func (d *deviceTracker) revoke(ctx context.Context, deviceID string) (bool, error) {
	n, err := d.queries.RevokeExternalDevice(ctx, deviceID)
	if err != nil {
		return false, err
	}
	d.mu.Lock()
	d.revoked[deviceID] = revokedEntry{revoked: true, checkedAt: d.now()}
	d.mu.Unlock()
	return n > 0, nil
}

// Device is one external player that has signed in.
type Device struct {
	DeviceID   string `json:"device_id"`
	Client     string `json:"client"`
	DeviceName string `json:"device_name"`
	FirstSeen  string `json:"first_seen"`
	LastSeen   string `json:"last_seen"`
	Revoked    bool   `json:"revoked"`
}

// ListDevices returns every device that ever signed in, newest first.
func (h *Handler) ListDevices(ctx context.Context) ([]Device, error) {
	rows, err := h.queries.ListExternalDevices(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Device, 0, len(rows))
	for _, row := range rows {
		out = append(out, Device{
			DeviceID: row.DeviceID, Client: row.Client, DeviceName: row.DeviceName,
			FirstSeen: row.FirstSeen, LastSeen: row.LastSeen, Revoked: row.Revoked != 0,
		})
	}
	return out, nil
}

// RevokeDevice invalidates every token the device holds. False when unknown.
func (h *Handler) RevokeDevice(ctx context.Context, deviceID string) (bool, error) {
	return h.devices.revoke(ctx, deviceID)
}

// DeviceCount is the number of devices that are not revoked.
func (h *Handler) DeviceCount(ctx context.Context) int {
	n, err := h.queries.CountActiveExternalDevices(ctx)
	if err != nil {
		return 0
	}
	return int(n)
}
