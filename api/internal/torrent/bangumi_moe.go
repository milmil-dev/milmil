package torrent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const bangumiMoeAPI = "https://bangumi.moe/api"

type BangumiMoeProvider struct {
	client *http.Client
}

func NewBangumiMoeProvider() *BangumiMoeProvider {
	return &BangumiMoeProvider{
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *BangumiMoeProvider) Name() string { return "bangumi.moe" }

func (p *BangumiMoeProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	// Step 1: Search for tags matching the query
	tagIDs, err := p.searchTags(ctx, query)
	if err != nil || len(tagIDs) == 0 {
		// No matching tags — return empty instead of misleading "latest" results
		return nil, nil
	}

	// Step 2: Search torrents by tag IDs
	return p.searchByTags(ctx, tagIDs)
}

func (p *BangumiMoeProvider) searchTags(ctx context.Context, query string) ([]string, error) {
	body, _ := json.Marshal(map[string]any{
		"name":     query,
		"keywords": true,
		"multi":    true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bangumiMoeAPI+"/tag/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var tags []struct {
		ID string `json:"_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(tags))
	for _, t := range tags {
		ids = append(ids, t.ID)
		if len(ids) >= 5 {
			break
		}
	}
	return ids, nil
}

func (p *BangumiMoeProvider) searchByTags(ctx context.Context, tagIDs []string) ([]SearchResult, error) {
	body, _ := json.Marshal(map[string]any{
		"tag_id": tagIDs,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bangumiMoeAPI+"/torrent/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return p.parseTorrents(resp.Body)
}

type bangumiMoeTorrent struct {
	ID          string   `json:"_id"`
	Title       string   `json:"title"`
	Magnet      string   `json:"magnet"`
	InfoHash    string   `json:"infoHash"`
	Size        string   `json:"size"`
	PublishTime string   `json:"publish_time"`
	TeamID      string   `json:"team_id"`
	TagIDs      []string `json:"tag_ids"`
}

func (p *BangumiMoeProvider) parseTorrents(r io.Reader) ([]SearchResult, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}

	// Response may be an array or an object with "torrents" field
	var torrents []bangumiMoeTorrent
	if err := json.Unmarshal(data, &torrents); err != nil {
		// Try object wrapper
		var wrapper struct {
			Torrents []bangumiMoeTorrent `json:"torrents"`
		}
		if err2 := json.Unmarshal(data, &wrapper); err2 != nil {
			return nil, fmt.Errorf("parse bangumi.moe response: %w", err)
		}
		torrents = wrapper.Torrents
	}

	results := make([]SearchResult, 0, len(torrents))
	for _, t := range torrents {
		r := SearchResult{
			Title:      t.Title,
			Magnet:     t.Magnet,
			InfoHash:   t.InfoHash,
			Size:       t.Size,
			SourceSite: "bangumi.moe",
			SubGroup:   extractSubGroup(t.Title),
			TorrentURL: fmt.Sprintf("https://bangumi.moe/download/torrent/%s/%s.torrent", t.ID, t.ID),
		}

		if t.PublishTime != "" {
			r.PublishDate, _ = time.Parse(time.RFC3339, t.PublishTime)
		}

		results = append(results, r)
	}
	return results, nil
}
