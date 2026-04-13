package rss

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

type FeedItem struct {
	Title   string
	Link    string
	PubDate time.Time
	Size    string
}

var torrentPubDateRe = regexp.MustCompile(`(?s)<item>.*?<title>([^<]*)</title>.*?<pubDate>([^<]*)</pubDate>.*?</item>`)

func parsePubDatesFromXML(body []byte) map[string]time.Time {
	result := make(map[string]time.Time)
	matches := torrentPubDateRe.FindAllSubmatch(body, -1)
	for _, m := range matches {
		title := string(m[1])
		raw := strings.TrimSpace(string(m[2]))
		for _, layout := range []string{
			time.RFC3339, "2006-01-02T15:04:05.999999",
			"2006-01-02T15:04:05", time.RFC1123Z, time.RFC1123,
		} {
			if t, err := time.Parse(layout, raw); err == nil {
				result[title] = t
				break
			}
		}
	}
	return result
}

func ParseFeed(ctx context.Context, url string) ([]FeedItem, error) {
	// Fetch raw body once
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Parse with gofeed
	fp := gofeed.NewParser()
	feed, err := fp.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	// Extract pubDates from raw XML (for Mikan-style feeds with custom namespaces)
	xmlDates := parsePubDatesFromXML(body)

	items := make([]FeedItem, 0, len(feed.Items))
	for _, item := range feed.Items {
		link := ""
		size := ""
		if len(item.Enclosures) > 0 {
			link = item.Enclosures[0].URL
			size = item.Enclosures[0].Length
		}
		if link == "" {
			link = item.Link
		}

		pubDate := time.Time{}
		if item.PublishedParsed != nil {
			pubDate = *item.PublishedParsed
		} else if item.UpdatedParsed != nil {
			pubDate = *item.UpdatedParsed
		}
		if pubDate.IsZero() {
			if t, ok := xmlDates[item.Title]; ok {
				pubDate = t
			}
		}

		items = append(items, FeedItem{
			Title:   item.Title,
			Link:    link,
			PubDate: pubDate,
			Size:    size,
		})
	}
	return items, nil
}
