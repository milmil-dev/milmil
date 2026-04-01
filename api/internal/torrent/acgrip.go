package torrent

import (
	"context"
	"strings"

	"github.com/mmcdole/gofeed"
)

// ACGRipProvider searches acg.rip via its RSS feed.
// Note: ACG.RIP does not support keyword search in RSS, so we fetch latest
// and filter client-side.
type ACGRipProvider struct{}

func NewACGRipProvider() *ACGRipProvider { return &ACGRipProvider{} }

func (p *ACGRipProvider) Name() string { return "acg.rip" }

func (p *ACGRipProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext("https://acg.rip/.xml", ctx)
	if err != nil {
		return nil, err
	}

	queryLower := strings.ToLower(query)
	results := make([]SearchResult, 0)
	for _, item := range feed.Items {
		// Client-side filter since ACG.RIP RSS has no search param
		if query != "" && !strings.Contains(strings.ToLower(item.Title), queryLower) {
			continue
		}

		r := SearchResult{
			Title:      item.Title,
			SourceSite: "acg.rip",
			SubGroup:   extractSubGroup(item.Title),
		}

		if item.PublishedParsed != nil {
			r.PublishDate = *item.PublishedParsed
		}

		if len(item.Enclosures) > 0 {
			enc := item.Enclosures[0].URL
			if strings.HasPrefix(enc, "magnet:") {
				r.Magnet = enc
				r.InfoHash = extractInfoHash(enc)
			} else {
				r.TorrentURL = enc
			}
		}

		results = append(results, r)
	}
	return results, nil
}
