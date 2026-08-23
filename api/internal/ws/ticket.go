package ws

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// TicketTTL is how long an issued WebSocket ticket stays redeemable.
// Kept short: a ticket only has to survive the round trip between the
// issuing HTTP call and the WebSocket upgrade that follows it.
const TicketTTL = 60 * time.Second

const ticketByteLen = 32

// TicketStore hands out single-use, short-lived tickets that authorise one
// WebSocket upgrade.
//
// The browser cannot set an Authorization header on a WebSocket handshake, and
// putting the long-lived API token in the query string would leak it into
// request logs and browser history. A ticket is redeemed exactly once, expires
// within TicketTTL, and is useless to anyone who later reads it out of a log.
type TicketStore struct {
	mu      sync.Mutex
	tickets map[string]ticket
	now     func() time.Time
}

type ticket struct {
	userID    string
	expiresAt time.Time
}

func NewTicketStore() *TicketStore {
	return &TicketStore{tickets: make(map[string]ticket), now: time.Now}
}

// Issue creates a ticket bound to userID. The returned string is the only
// copy the caller will ever get; the store keeps just the lookup key.
func (s *TicketStore) Issue(userID string) (string, error) {
	b := make([]byte, ticketByteLen)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate ws ticket: %w", err)
	}
	key := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.evictExpiredLocked()
	s.tickets[key] = ticket{userID: userID, expiresAt: s.now().Add(TicketTTL)}
	return key, nil
}

// Redeem consumes a ticket and returns the user it was issued to. A ticket is
// removed whether or not it had expired, so a redeem attempt can never be
// replayed.
func (s *TicketStore) Redeem(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t, ok := s.tickets[key]
	if !ok {
		return "", false
	}
	delete(s.tickets, key)
	if s.now().After(t.expiresAt) {
		return "", false
	}
	return t.userID, true
}

// evictExpiredLocked drops timed-out tickets. Called on Issue so the map stays
// bounded by the number of live sessions rather than growing forever; there is
// no background goroutine to leak.
func (s *TicketStore) evictExpiredLocked() {
	now := s.now()
	for k, t := range s.tickets {
		if now.After(t.expiresAt) {
			delete(s.tickets, k)
		}
	}
}
