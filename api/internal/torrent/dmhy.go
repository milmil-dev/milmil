package torrent

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/mmcdole/gofeed"
)

type DMHYProvider struct{}

func NewDMHYProvider() *DMHYProvider { return &DMHYProvider{} }

func (p *DMHYProvider) Name() string { return "dmhy" }

func (p *DMHYProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	feedURL := fmt.Sprintf("https://share.dmhy.org/topics/rss/rss.xml?keyword=%s", url.QueryEscape(query))
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(feed.Items))
	for _, item := range feed.Items {
		r := SearchResult{
			Title:      item.Title,
			SourceSite: "dmhy",
			SubGroup:   extractSubGroup(item.Title),
		}

		if item.PublishedParsed != nil {
			r.PublishDate = *item.PublishedParsed
		}

		// DMHY enclosures contain magnet links
		if len(item.Enclosures) > 0 {
			enc := item.Enclosures[0].URL
			if strings.HasPrefix(enc, "magnet:") {
				r.Magnet = enc
				r.InfoHash = extractInfoHash(enc)
			} else {
				r.TorrentURL = enc
			}
		}

		// Extract size from description if available (format: "X.XX GB" or "X.XX MB")
		if item.Description != "" {
			r.Size = extractSizeFromDesc(item.Description)
		}

		// Author is the fansub group on DMHY
		if item.Author != nil && item.Author.Name != "" {
			r.SubGroup = item.Author.Name
		} else if r.SubGroup == "" {
			r.SubGroup = item.Custom["author"]
		}

		results = append(results, r)
	}
	return results, nil
}

// extractInfoHash pulls the BTIH hash from a magnet link.
func extractInfoHash(magnet string) string {
	u, err := url.Parse(magnet)
	if err != nil {
		return ""
	}
	xt := u.Query().Get("xt")
	if strings.HasPrefix(xt, "urn:btih:") {
		return strings.TrimPrefix(xt, "urn:btih:")
	}
	return ""
}

// extractSizeFromDesc tries to find a file size pattern in HTML description text.
func extractSizeFromDesc(desc string) string {
	// Simple heuristic: look for "XX.XX GB" or "XX.XX MB" patterns
	for _, unit := range []string{"GB", "MB", "TB"} {
		idx := strings.Index(desc, unit)
		if idx < 1 {
			continue
		}
		// Walk back to find the start of the number
		start := idx - 1
		for start > 0 && (desc[start] >= '0' && desc[start] <= '9' || desc[start] == '.' || desc[start] == ' ') {
			start--
		}
		start++
		size := strings.TrimSpace(desc[start : idx+len(unit)])
		if size != "" {
			return size
		}
	}
	return ""
}
