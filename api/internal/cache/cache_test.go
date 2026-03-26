package cache_test

import (
	"context"
	"testing"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/stretchr/testify/require"
)

// Tests run against in-memory cache — no external services needed.
func TestMemoryCache_SetGet(t *testing.T) {
	c := cache.New("") // empty REDIS_URL → in-memory
	ctx := context.Background()

	err := c.Set(ctx, "key1", []byte("hello"), 5*time.Second)
	require.NoError(t, err)

	val, err := c.Get(ctx, "key1")
	require.NoError(t, err)
	require.Equal(t, []byte("hello"), val)
}

func TestMemoryCache_Miss(t *testing.T) {
	c := cache.New("")
	_, err := c.Get(context.Background(), "missing")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}

func TestMemoryCache_TTLExpiry(t *testing.T) {
	c := cache.New("")
	ctx := context.Background()

	err := c.Set(ctx, "expiring", []byte("val"), 50*time.Millisecond)
	require.NoError(t, err)

	time.Sleep(100 * time.Millisecond)
	_, err = c.Get(ctx, "expiring")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}

func TestMemoryCache_Del(t *testing.T) {
	c := cache.New("")
	ctx := context.Background()
	_ = c.Set(ctx, "del_key", []byte("v"), time.Minute)
	err := c.Del(ctx, "del_key")
	require.NoError(t, err)
	_, err = c.Get(ctx, "del_key")
	require.ErrorIs(t, err, cache.ErrCacheMiss)
}
