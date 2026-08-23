package ws_test

import (
	"sync"
	"testing"
	"time"

	"github.com/milmil/api/internal/ws"
	"github.com/stretchr/testify/require"
)

func TestTicketRoundTrip(t *testing.T) {
	s := ws.NewTicketStore()

	key, err := s.Issue("user-1")
	require.NoError(t, err)
	require.NotEmpty(t, key)

	userID, ok := s.Redeem(key)
	require.True(t, ok)
	require.Equal(t, "user-1", userID)
}

func TestTicketIsSingleUse(t *testing.T) {
	s := ws.NewTicketStore()
	key, err := s.Issue("user-1")
	require.NoError(t, err)

	_, ok := s.Redeem(key)
	require.True(t, ok)

	// A replayed ticket must not authorise a second upgrade.
	_, ok = s.Redeem(key)
	require.False(t, ok)
}

func TestRedeemUnknownTicket(t *testing.T) {
	s := ws.NewTicketStore()
	_, ok := s.Redeem("not-a-ticket")
	require.False(t, ok)
}

func TestTicketExpires(t *testing.T) {
	s := ws.NewTicketStore()
	now := time.Now()
	ws.SetClockForTest(s, func() time.Time { return now })

	key, err := s.Issue("user-1")
	require.NoError(t, err)

	now = now.Add(ws.TicketTTL + time.Second)
	_, ok := s.Redeem(key)
	require.False(t, ok, "expired ticket must be rejected")
}

func TestIssueEvictsExpiredTickets(t *testing.T) {
	s := ws.NewTicketStore()
	now := time.Now()
	ws.SetClockForTest(s, func() time.Time { return now })

	stale, err := s.Issue("user-1")
	require.NoError(t, err)

	now = now.Add(ws.TicketTTL + time.Second)
	// Issuing sweeps the map, so the stale entry is gone before we look.
	_, err = s.Issue("user-2")
	require.NoError(t, err)
	require.Equal(t, 1, ws.LenForTest(s))

	_, ok := s.Redeem(stale)
	require.False(t, ok)
}

func TestTicketStoreIsConcurrencySafe(t *testing.T) {
	s := ws.NewTicketStore()

	const n = 50
	keys := make([]string, n)
	for i := range keys {
		key, err := s.Issue("user-1")
		require.NoError(t, err)
		keys[i] = key
	}

	// Every ticket is redeemed from two goroutines at once; exactly n redeems
	// across all of them may succeed.
	var (
		mu        sync.Mutex
		succeeded int
		wg        sync.WaitGroup
	)
	for _, key := range keys {
		for range 2 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, ok := s.Redeem(key); ok {
					mu.Lock()
					succeeded++
					mu.Unlock()
				}
			}()
		}
	}
	wg.Wait()
	require.Equal(t, n, succeeded)
}
