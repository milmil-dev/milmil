package cache

import (
	"crypto/sha1"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

type debugCache struct {
	next    Cache
	backend Backend
}

// WithDebugLogging wraps a cache and logs cache operations at debug level.
func WithDebugLogging(c Cache, backend Backend) Cache {
	return &debugCache{next: c, backend: backend}
}

func (d *debugCache) Get(ctx context.Context, key string) ([]byte, error) {
	val, err := d.next.Get(ctx, key)
	ns, sig, keyLen := cacheKeyMeta(key)
	hit := err == nil
	if errors.Is(err, ErrCacheMiss) {
		slog.Debug("cache get", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "hit", false)
	} else if err != nil {
		slog.Debug("cache get", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "hit", false, "err", err)
	} else {
		slog.Debug("cache get", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "hit", hit)
	}
	return val, err
}

func (d *debugCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	err := d.next.Set(ctx, key, value, ttl)
	ns, sig, keyLen := cacheKeyMeta(key)
	if err != nil {
		slog.Debug("cache set", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "ttl", ttl.String(), "ok", false, "err", err)
	} else {
		slog.Debug("cache set", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "ttl", ttl.String(), "ok", true)
	}
	return err
}

func (d *debugCache) Del(ctx context.Context, key string) error {
	err := d.next.Del(ctx, key)
	ns, sig, keyLen := cacheKeyMeta(key)
	if err != nil {
		slog.Debug("cache del", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "ok", false, "err", err)
	} else {
		slog.Debug("cache del", "backend", d.backend, "key_ns", ns, "key_sig", sig, "key_len", keyLen, "ok", true)
	}
	return err
}

func (d *debugCache) Close() error {
	return d.next.Close()
}

func cacheKeyMeta(key string) (namespace string, sig string, keyLen int) {
	parts := strings.Split(key, ":")
	if len(parts) >= 2 {
		namespace = parts[0] + ":" + parts[1]
	} else {
		namespace = key
	}
	h := sha1.Sum([]byte(key))
	return namespace, fmt.Sprintf("%x", h[:4]), len(key)
}
