package rss

import (
	"context"
	"time"

	"github.com/mmcdole/gofeed"
)

type FeedItem struct {
	Title   string
	Link    string
	PubDate time.Time
}

func ParseFeed(ctx context.Context, url string) ([]FeedItem, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(url, ctx)
	if err != nil {
		return nil, err
	}

	items := make([]FeedItem, 0, len(feed.Items))
	for _, item := range feed.Items {
		link := ""
		if len(item.Enclosures) > 0 {
			link = item.Enclosures[0].URL
		}
		if link == "" {
			link = item.Link
		}

		pubDate := time.Time{}
		if item.PublishedParsed != nil {
			pubDate = *item.PublishedParsed
		}

		items = append(items, FeedItem{
			Title:   item.Title,
			Link:    link,
			PubDate: pubDate,
		})
	}
	return items, nil
}
