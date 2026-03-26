package cache

import (
	"context"
	"sync"
	"time"
)

type memoryEntry struct {
	value     []byte
	expiresAt time.Time
}

type memoryCache struct {
	mu      sync.RWMutex
	entries map[string]memoryEntry
}

func newMemoryCache() *memoryCache {
	return &memoryCache{entries: make(map[string]memoryEntry)}
}

func (m *memoryCache) Get(_ context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	entry, ok := m.entries[key]
	m.mu.RUnlock()
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, ErrCacheMiss
	}
	return entry.value, nil
}

func (m *memoryCache) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	m.mu.Lock()
	m.entries[key] = memoryEntry{value: value, expiresAt: time.Now().Add(ttl)}
	m.mu.Unlock()
	return nil
}

func (m *memoryCache) Del(_ context.Context, key string) error {
	m.mu.Lock()
	delete(m.entries, key)
	m.mu.Unlock()
	return nil
}

func (m *memoryCache) Close() error { return nil }
