package torrent

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/mmcdole/gofeed"
)

type MikanProvider struct{}

func NewMikanProvider() *MikanProvider { return &MikanProvider{} }

func (p *MikanProvider) Name() string { return "mikan" }

func (p *MikanProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	// Mikan supports keyword search via their RSS endpoint
	feedURL := fmt.Sprintf("https://mikanani.me/RSS/Search?searchstr=%s", url.QueryEscape(query))
	return p.parseFeed(ctx, feedURL)
}

// SearchByBangumiID fetches all releases for a specific Mikan bangumi ID.
func (p *MikanProvider) SearchByBangumiID(ctx context.Context, bangumiID string, subgroupID string) ([]SearchResult, error) {
	feedURL := fmt.Sprintf("https://mikanani.me/RSS/Bangumi?bangumiId=%s", bangumiID)
	if subgroupID != "" {
		feedURL += "&subgroupid=" + subgroupID
	}
	return p.parseFeed(ctx, feedURL)
}

func (p *MikanProvider) parseFeed(ctx context.Context, feedURL string) ([]SearchResult, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(feed.Items))
	for _, item := range feed.Items {
		r := SearchResult{
			Title:      item.Title,
			SourceSite: "mikan",
			SubGroup:   extractSubGroup(item.Title),
		}

		if item.PublishedParsed != nil {
			r.PublishDate = *item.PublishedParsed
		}

		// Mikan enclosures contain .torrent file URLs
		if len(item.Enclosures) > 0 {
			enc := item.Enclosures[0].URL
			if strings.HasPrefix(enc, "magnet:") {
				r.Magnet = enc
				r.InfoHash = extractInfoHash(enc)
			} else {
				r.TorrentURL = enc
			}
			// Extract size from enclosure length
			if item.Enclosures[0].Length != "" {
				r.Size = item.Enclosures[0].Length
			}
		}

		// Try custom torrent namespace for content length
		if ext, ok := item.Extensions["torrent"]; ok {
			if v, ok := ext["contentLength"]; ok && len(v) > 0 && r.Size == "" {
				r.Size = v[0].Value
			}
		}

		results = append(results, r)
	}
	return results, nil
}
