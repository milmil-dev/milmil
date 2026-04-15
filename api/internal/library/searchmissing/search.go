package searchmissing

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/milmil/api/internal/matcher/fileparse"
	"github.com/milmil/api/internal/torrent"
)

type Aggregator struct {
	registry *torrent.Registry
}

func NewAggregator(r *torrent.Registry) *Aggregator {
	return &Aggregator{registry: r}
}

// Search queries every registered torrent provider in parallel, dedupes, ranks.
func (a *Aggregator) Search(ctx context.Context, animeTitle string, episodeNumber int) ([]Result, error) {
	if a.registry == nil {
		return nil, fmt.Errorf("no torrent registry")
	}
	query := buildQuery(animeTitle, episodeNumber)

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	raw := a.registry.SearchAll(ctx, query)

	raws := make([]Raw, 0, len(raw))
	for _, r := range raw {
		raws = append(raws, Raw{
			Title:       r.Title,
			Magnet:      r.Magnet,
			TorrentURL:  r.TorrentURL,
			SizeBytes:   parseSizeBytes(r.Size),
			SizeDisplay: r.Size,
			Seeders:     r.Seeders,
			Leechers:    r.Leechers,
			InfoHash:    r.InfoHash,
			Provider:    r.SourceSite,
			PublishedAt: r.PublishDate.UTC().Format(time.RFC3339),
		})
	}

	deduped := Dedupe(raws)
	results := make([]Result, len(deduped))
	for i, r := range deduped {
		results[i] = Result{Raw: r, Parsed: fileparse.Parse(r.Title)}
	}
	return Rank(results), nil
}

func buildQuery(title string, ep int) string {
	return fmt.Sprintf("%s %02d", strings.TrimSpace(title), ep)
}

var sizeRe = regexp.MustCompile(`(?i)^\s*([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?\s*$`)

// parseSizeBytes converts a human-readable size ("1.5 GiB", "500 MB") to bytes.
// Returns 0 when unparseable.
func parseSizeBytes(s string) int64 {
	if s == "" {
		return 0
	}
	m := sizeRe.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0
	}
	unit := strings.ToLower(m[2])
	var mul int64
	switch unit {
	case "", "b":
		mul = 1
	case "kb":
		mul = 1_000
	case "kib":
		mul = 1024
	case "mb":
		mul = 1_000_000
	case "mib":
		mul = 1024 * 1024
	case "gb":
		mul = 1_000_000_000
	case "gib":
		mul = 1024 * 1024 * 1024
	case "tb":
		mul = 1_000_000_000_000
	case "tib":
		mul = 1024 * 1024 * 1024 * 1024
	}
	return int64(v * float64(mul))
}
