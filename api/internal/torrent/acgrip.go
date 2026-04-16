package torrent

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/mmcdole/gofeed"
)

// ACGRipProvider searches acg.rip via its RSS feed with keyword search.
type ACGRipProvider struct{}

func NewACGRipProvider() *ACGRipProvider { return &ACGRipProvider{} }

func (p *ACGRipProvider) Name() string { return "acg.rip" }

func (p *ACGRipProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	feedURL := "https://acg.rip/.xml"
	if query != "" {
		feedURL = fmt.Sprintf("https://acg.rip/.xml?term=%s", url.QueryEscape(query))
	}

	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(feed.Items))
	for _, item := range feed.Items {
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
