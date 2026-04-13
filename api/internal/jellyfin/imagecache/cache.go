package imagecache

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const defaultTTL = 7 * 24 * time.Hour

// Cache stores proxied images on disk with TTL-based expiry.
type Cache struct {
	dir string
}

// New creates a cache in the given directory.
func New(dir string) (*Cache, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &Cache{dir: dir}, nil
}

// Get returns the cached file path if it exists and is not expired.
func (c *Cache) Get(url string) (string, bool) {
	path := c.pathFor(url)
	info, err := os.Stat(path)
	if err != nil {
		return "", false
	}
	if time.Since(info.ModTime()) > defaultTTL {
		os.Remove(path)
		return "", false
	}
	return path, true
}

// Fetch downloads the URL and stores it in the cache. Returns the cached file path.
func (c *Cache) Fetch(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch image: status %d", resp.StatusCode)
	}

	path := c.pathFor(url)
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		os.Remove(path)
		return "", err
	}
	return path, nil
}

func (c *Cache) pathFor(url string) string {
	h := sha256.Sum256([]byte(url))
	return filepath.Join(c.dir, fmt.Sprintf("%x", h))
}
