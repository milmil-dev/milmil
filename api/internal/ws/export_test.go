package ws

import "time"

// SetClockForTest overrides the store's clock so expiry can be exercised
// without sleeping.
func SetClockForTest(s *TicketStore, now func() time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.now = now
}

// LenForTest reports how many tickets are currently held.
func LenForTest(s *TicketStore) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.tickets)
}
