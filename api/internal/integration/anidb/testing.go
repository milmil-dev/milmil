package anidb

// SetIndexesForTest swaps in pre-loaded indexes for tests. Not for production use.
func (s *Service) SetIndexesForTest(m *Mapping, t *TitleIndex) {
	s.mu.Lock()
	s.mapping = m
	s.titles = t
	s.mu.Unlock()
}
