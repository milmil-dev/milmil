package torrent

import (
	"context"
	"sort"
	"sync"
	"time"
)

// SearchResult is the unified result returned by all torrent providers.
type SearchResult struct {
	Title       string    `json:"title"`
	Magnet      string    `json:"magnet,omitempty"`
	TorrentURL  string    `json:"torrent_url,omitempty"`
	Size        string    `json:"size,omitempty"`
	Seeders     int       `json:"seeders"`
	Leechers    int       `json:"leechers"`
	PublishDate time.Time `json:"publish_date"`
	SubGroup    string    `json:"sub_group,omitempty"`
	InfoHash    string    `json:"info_hash,omitempty"`
	SourceSite  string    `json:"source_site"`
}

// DownloadURL returns the best URL for downloading — prefers magnet, falls back to torrent URL.
func (r SearchResult) DownloadURL() string {
	if r.Magnet != "" {
		return r.Magnet
	}
	return r.TorrentURL
}

// Provider searches a single torrent source.
type Provider interface {
	Name() string
	Search(ctx context.Context, query string) ([]SearchResult, error)
}

// Registry holds all registered torrent providers and dispatches searches.
type Registry struct {
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
}

func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

// Search queries a single provider by name.
func (r *Registry) Search(ctx context.Context, source, query string) ([]SearchResult, error) {
	p, ok := r.providers[source]
	if !ok {
		return nil, nil
	}
	return p.Search(ctx, query)
}

// SearchAll queries all providers concurrently and merges results.
func (r *Registry) SearchAll(ctx context.Context, query string) []SearchResult {
	var (
		mu      sync.Mutex
		results []SearchResult
		wg      sync.WaitGroup
	)
	for _, p := range r.providers {
		wg.Add(1)
		go func(p Provider) {
			defer wg.Done()
			res, err := p.Search(ctx, query)
			if err != nil || len(res) == 0 {
				return
			}
			mu.Lock()
			results = append(results, res...)
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	return results
}

// SortByDate sorts search results by publish date descending (newest first).
func SortByDate(results []SearchResult) {
	sort.Slice(results, func(i, j int) bool {
		return results[i].PublishDate.After(results[j].PublishDate)
	})
}
