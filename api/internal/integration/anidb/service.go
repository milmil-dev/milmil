package anidb

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Service is the facade the rest of the app depends on. Safe for concurrent use.
// When caches are missing (cold start or failed download), Resolve/SearchTitles
// return empty results — they are intentionally non-blocking.
type Service struct {
	client Client
	dir    string

	mu      sync.RWMutex
	mapping *Mapping
	titles  *TitleIndex

	minInterval time.Duration
	lastFetchMu sync.Mutex
	lastFetch   time.Time
}

type lastFetchFile struct {
	Manami     time.Time `json:"manami"`
	AnimeLists time.Time `json:"anime_lists"`
	Titles     time.Time `json:"titles"`
}

func NewService(c Client, dataDir string) *Service {
	return &Service{
		client:      c,
		dir:         dataDir,
		minInterval: 24 * time.Hour,
	}
}

func (s *Service) SetMinInterval(d time.Duration) { s.minInterval = d }

func (s *Service) Resolve(src Source, id int64) (IDSet, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mapping.Resolve(src, id)
}

func (s *Service) SearchTitles(query string, year int) []Candidate {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.titles.Search(query, year)
}

// Refresh downloads all sources if the last refresh is older than minInterval,
// parses them, writes them atomically to dataDir, and swaps the in-memory
// indexes. Returns nil and does nothing if rate-limited.
func (s *Service) Refresh(ctx context.Context) error {
	s.lastFetchMu.Lock()
	if !s.lastFetch.IsZero() && time.Since(s.lastFetch) < s.minInterval {
		s.lastFetchMu.Unlock()
		return nil
	}
	s.lastFetchMu.Unlock()

	if s.client == nil {
		return errors.New("anidb: no client configured")
	}
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}

	manamiBytes, err := s.client.DownloadManami(ctx)
	if err != nil {
		return err
	}
	animeListsBytes, err := s.client.DownloadAnimeLists(ctx)
	if err != nil {
		return err
	}
	titlesBytes, err := s.client.DownloadTitles(ctx)
	if err != nil {
		return err
	}

	// Parse all three before any swap or write; never leave partial state.
	m, err := LoadMapping(manamiBytes)
	if err != nil {
		return err
	}
	extras, err := LoadAnimeListsMapping(animeListsBytes)
	if err != nil {
		return err
	}
	m.MergeIDSets(extras)
	ti, err := LoadTitleIndex(titlesBytes)
	if err != nil {
		return err
	}

	if err := atomicWrite(filepath.Join(s.dir, "manami.json"), manamiBytes); err != nil {
		return err
	}
	if err := atomicWrite(filepath.Join(s.dir, "anime-lists.xml"), animeListsBytes); err != nil {
		return err
	}
	if err := atomicWrite(filepath.Join(s.dir, "titles.xml"), titlesBytes); err != nil {
		return err
	}

	s.mu.Lock()
	s.mapping = m
	s.titles = ti
	s.mu.Unlock()

	now := time.Now().UTC()
	s.lastFetchMu.Lock()
	s.lastFetch = now
	s.lastFetchMu.Unlock()

	lf := lastFetchFile{Manami: now, AnimeLists: now, Titles: now}
	if buf, err := json.Marshal(lf); err == nil {
		_ = atomicWrite(filepath.Join(s.dir, "last-fetch.json"), buf)
	}
	slog.Info("anidb: refresh complete",
		"manami_bytes", len(manamiBytes),
		"anime_lists_bytes", len(animeListsBytes),
		"titles_bytes", len(titlesBytes))
	return nil
}

// LoadFromDisk hydrates indexes from a previous refresh, without any network.
// Returns an error if any required file is missing or cannot be parsed.
func (s *Service) LoadFromDisk() error {
	manamiBytes, err := os.ReadFile(filepath.Join(s.dir, "manami.json"))
	if err != nil {
		return err
	}
	animeListsBytes, err := os.ReadFile(filepath.Join(s.dir, "anime-lists.xml"))
	if err != nil {
		return err
	}
	titlesBytes, err := os.ReadFile(filepath.Join(s.dir, "titles.xml"))
	if err != nil {
		return err
	}

	m, err := LoadMapping(manamiBytes)
	if err != nil {
		return err
	}
	extras, err := LoadAnimeListsMapping(animeListsBytes)
	if err != nil {
		return err
	}
	m.MergeIDSets(extras)
	ti, err := LoadTitleIndex(titlesBytes)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.mapping = m
	s.titles = ti
	s.mu.Unlock()

	if buf, err := os.ReadFile(filepath.Join(s.dir, "last-fetch.json")); err == nil {
		var lf lastFetchFile
		if json.Unmarshal(buf, &lf) == nil {
			s.lastFetchMu.Lock()
			s.lastFetch = lf.Manami
			s.lastFetchMu.Unlock()
		}
	}
	return nil
}

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
