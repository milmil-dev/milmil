package torrent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// DanDanPlayProvider uses the DanDanPlay resource search API.
// This is a unified search that aggregates results from multiple Chinese torrent sites.
type DanDanPlayProvider struct {
	// NodeURL is the base URL of the DanDanPlay resource search node.
	// Default: https://api.dandanplay.net
	NodeURL string
	client  *http.Client
}

func NewDanDanPlayProvider(nodeURL string) *DanDanPlayProvider {
	if nodeURL == "" {
		nodeURL = "https://api.dandanplay.net"
	}
	return &DanDanPlayProvider{
		NodeURL: nodeURL,
		client:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *DanDanPlayProvider) Name() string { return "dandanplay" }

func (p *DanDanPlayProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	u := fmt.Sprintf("%s/api/v2/resource/search?keyword=%s", p.NodeURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dandanplay: status %d", resp.StatusCode)
	}

	var body struct {
		Resources []ddpResource `json:"Resources"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(body.Resources))
	for _, r := range body.Resources {
		sr := SearchResult{
			Title:      r.Title,
			Magnet:     r.Magnet,
			Size:       r.FileSize,
			SubGroup:   r.SubgroupName,
			SourceSite: "dandanplay",
		}

		if r.Magnet != "" {
			sr.InfoHash = extractInfoHash(r.Magnet)
		}

		if r.PublishDate != "" {
			sr.PublishDate, _ = time.Parse("2006-01-02 15:04:05", r.PublishDate)
		}

		results = append(results, sr)
	}
	return results, nil
}

// SubGroups fetches the list of known fansub groups from the DanDanPlay node.
func (p *DanDanPlayProvider) SubGroups(ctx context.Context) ([]SubGroupInfo, error) {
	u := p.NodeURL + "/api/v2/resource/subgroup"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var body struct {
		Subgroups []SubGroupInfo `json:"Subgroups"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	return body.Subgroups, nil
}

type SubGroupInfo struct {
	ID   int    `json:"Id"`
	Name string `json:"Name"`
}

type ddpResource struct {
	Title        string `json:"Title"`
	TypeID       int    `json:"TypeId"`
	TypeName     string `json:"TypeName"`
	SubgroupID   int    `json:"SubgroupId"`
	SubgroupName string `json:"SubgroupName"`
	Magnet       string `json:"Magnet"`
	PageURL      string `json:"PageUrl"`
	FileSize     string `json:"FileSize"`
	PublishDate  string `json:"PublishDate"`
}
