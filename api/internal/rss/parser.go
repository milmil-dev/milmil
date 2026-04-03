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
	Size    string
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
