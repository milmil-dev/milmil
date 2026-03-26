package cache

import (
	"context"
	"errors"
	"time"
)

// ErrCacheMiss is returned when a key is not found or has expired.
var ErrCacheMiss = errors.New("cache miss")

// Cache is a simple key-value cache interface.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Del(ctx context.Context, key string) error
	Close() error
}

// New returns a Redis-backed cache if redisURL is non-empty,
// or an in-memory cache otherwise (suitable for development).
func New(redisURL string) Cache {
	if redisURL != "" {
		if c, err := newRedisCache(redisURL); err == nil {
			return c
		}
	}
	return newMemoryCache()
}
