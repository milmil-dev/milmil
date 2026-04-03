package downloader

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

type httpEntry struct {
	gid       string
	url       string
	name      string
	saveDir   string
	status    string
	err       string
	total     int64
	completed atomic.Int64
	speed     atomic.Int64
	cancel    context.CancelFunc
}

type httpDownloader struct {
	mu      sync.RWMutex
	entries map[string]*httpEntry
}

func newHTTPDownloader() *httpDownloader {
	return &httpDownloader{
		entries: make(map[string]*httpEntry),
	}
}

func (h *httpDownloader) add(ctx context.Context, url, saveDir, name string) (string, error) {
	gid := fmt.Sprintf("http-%d", time.Now().UnixNano())

	if name == "" {
		name = filepath.Base(url)
	}

	dlCtx, cancel := context.WithCancel(context.Background())

	entry := &httpEntry{
		gid:     gid,
		url:     url,
		name:    name,
		saveDir: saveDir,
		status:  "active",
		cancel:  cancel,
	}

	h.mu.Lock()
	h.entries[gid] = entry
	h.mu.Unlock()

	go h.download(dlCtx, entry)

	return gid, nil
}

func (h *httpDownloader) download(ctx context.Context, entry *httpEntry) {
	dest := filepath.Join(entry.saveDir, entry.name)
	if err := os.MkdirAll(entry.saveDir, 0o755); err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, entry.url, nil)
	if err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return // cancelled (paused/removed)
		}
		entry.status = "error"
		entry.err = err.Error()
		return
	}
	defer resp.Body.Close()

	entry.total = resp.ContentLength

	f, err := os.Create(dest)
	if err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	lastCheck := time.Now()
	var lastBytes int64

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				entry.status = "error"
				entry.err = writeErr.Error()
				return
			}
			entry.completed.Add(int64(n))

			// Calculate speed every second.
			now := time.Now()
			if now.Sub(lastCheck) >= time.Second {
				current := entry.completed.Load()
				entry.speed.Store(current - lastBytes)
				lastBytes = current
				lastCheck = now
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			if ctx.Err() != nil {
				return // cancelled
			}
			entry.status = "error"
			entry.err = readErr.Error()
			return
		}
	}

	entry.status = "complete"
	entry.speed.Store(0)
	slog.Info("http download complete", "name", entry.name)
}

func (h *httpDownloader) pause(gid string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.entries[gid]
	if !ok {
		return fmt.Errorf("download %s not found", gid)
	}
	entry.cancel()
	entry.status = "paused"
	entry.speed.Store(0)
	return nil
}

func (h *httpDownloader) resume(ctx context.Context, gid string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.entries[gid]
	if !ok {
		return fmt.Errorf("download %s not found", gid)
	}
	dlCtx, cancel := context.WithCancel(context.Background())
	entry.cancel = cancel
	entry.status = "active"
	go h.download(dlCtx, entry)
	return nil
}

func (h *httpDownloader) remove(gid string) {
	h.mu.Lock()
	entry, ok := h.entries[gid]
	if ok {
		entry.cancel()
		delete(h.entries, gid)
	}
	h.mu.Unlock()
}

func (h *httpDownloader) status(gid string) (*Status, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.entries[gid]
	if !ok {
		return nil, fmt.Errorf("download %s not found", gid)
	}
	return &Status{
		GID:            gid,
		Name:           entry.name,
		Status:         entry.status,
		TotalBytes:     entry.total,
		CompletedBytes: entry.completed.Load(),
		SpeedBytes:     entry.speed.Load(),
		SaveDir:        entry.saveDir,
		Error:          entry.err,
	}, nil
}

func (h *httpDownloader) files(gid string) ([]FileInfo, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.entries[gid]
	if !ok {
		return nil, fmt.Errorf("download %s not found", gid)
	}
	return []FileInfo{{
		Path:     filepath.Join(entry.saveDir, entry.name),
		Size:     entry.total,
		Complete: entry.completed.Load(),
	}}, nil
}
