package cache

import (
	"context"
	"errors"
	"time"
)

type Backend string

const (
	BackendMemory Backend = "memory"
	BackendRedis  Backend = "redis"
)

// InitResult describes which backend was actually initialized and whether a fallback happened.
type InitResult struct {
	Cache    Cache
	Backend  Backend
	Fallback bool
	Err      error
}

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
	return NewWithStatus(redisURL).Cache
}

// NewWithStatus returns cache initialization details, including fallback cause.
func NewWithStatus(redisURL string) InitResult {
	if redisURL != "" {
		if c, err := newRedisCache(redisURL); err == nil {
			return InitResult{Cache: c, Backend: BackendRedis}
		} else {
			return InitResult{Cache: newMemoryCache(), Backend: BackendMemory, Fallback: true, Err: err}
		}
	}

	return InitResult{Cache: newMemoryCache(), Backend: BackendMemory}
}
