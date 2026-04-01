package torrent

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

type NyaaProvider struct{}

func NewNyaaProvider() *NyaaProvider { return &NyaaProvider{} }

func (p *NyaaProvider) Name() string { return "nyaa" }

func (p *NyaaProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	feedURL := fmt.Sprintf("https://nyaa.si/?page=rss&q=%s&c=1_0&f=0", url.QueryEscape(query))
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(feed.Items))
	for _, item := range feed.Items {
		r := SearchResult{
			Title:      item.Title,
			SourceSite: "nyaa",
		}

		// Torrent file link is in <link>, magnet is typically not in RSS but we can construct from info hash
		if len(item.Enclosures) > 0 {
			r.TorrentURL = item.Enclosures[0].URL
		}

		if item.PublishedParsed != nil {
			r.PublishDate = *item.PublishedParsed
		}

		// Extract nyaa: namespace fields
		if nyaa, ok := item.Extensions["nyaa"]; ok {
			if v, ok := nyaa["seeders"]; ok && len(v) > 0 {
				r.Seeders, _ = strconv.Atoi(v[0].Value)
			}
			if v, ok := nyaa["leechers"]; ok && len(v) > 0 {
				r.Leechers, _ = strconv.Atoi(v[0].Value)
			}
			if v, ok := nyaa["size"]; ok && len(v) > 0 {
				r.Size = v[0].Value
			}
			if v, ok := nyaa["infoHash"]; ok && len(v) > 0 {
				r.InfoHash = v[0].Value
				r.Magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s&dn=%s", v[0].Value, url.QueryEscape(item.Title))
			}
		}

		// Extract sub group from title like [SubGroup] ...
		r.SubGroup = extractSubGroup(item.Title)

		results = append(results, r)
	}
	return results, nil
}

// extractSubGroup extracts the first bracketed group from a torrent title.
// e.g. "[SubsPlease] Anime - 01 (1080p)" → "SubsPlease"
func extractSubGroup(title string) string {
	if !strings.HasPrefix(title, "[") {
		return ""
	}
	end := strings.Index(title, "]")
	if end < 2 {
		return ""
	}
	return title[1:end]
}

// parseNyaaDate parses Nyaa's RFC2822-style date format.
func parseNyaaDate(s string) time.Time {
	t, _ := time.Parse(time.RFC1123Z, s)
	return t
}
