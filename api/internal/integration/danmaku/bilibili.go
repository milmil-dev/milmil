package danmaku

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

const (
	bilibiliSearchURL  = "https://api.bilibili.com/x/web-interface/search/type"
	bilibiliViewURL    = "https://api.bilibili.com/x/web-interface/view"
	bilibiliDanmakuURL = "https://comment.bilibili.com"
	bilibiliUserAgent  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

// BilibiliSource implements Source for Bilibili danmaku.
type BilibiliSource struct {
	client *http.Client
}

// NewBilibiliSource creates a new BilibiliSource with the given HTTP client.
func NewBilibiliSource(c *http.Client) *BilibiliSource {
	if c == nil {
		c = http.DefaultClient
	}
	return &BilibiliSource{client: c}
}

func (b *BilibiliSource) Name() string {
	return "bilibili"
}

// bilibiliSearchResponse is the top-level API response for search.
type bilibiliSearchResponse struct {
	Code int `json:"code"`
	Data struct {
		Result []bilibiliSearchResult `json:"result"`
	} `json:"data"`
}

type bilibiliSearchResult struct {
	BVID     string `json:"bvid"`
	Title    string `json:"title"`
	Duration string `json:"duration"`
	Pic      string `json:"pic"`
	Danmaku  int    `json:"video_review"`
}

func (b *BilibiliSource) Search(ctx context.Context, keyword string, page int) ([]SearchResult, error) {
	u, _ := url.Parse(bilibiliSearchURL)
	q := u.Query()
	q.Set("search_type", "video")
	q.Set("keyword", keyword)
	q.Set("page", strconv.Itoa(page))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili search: create request: %w", err)
	}
	req.Header.Set("User-Agent", bilibiliUserAgent)

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili search: %w", err)
	}
	defer resp.Body.Close()

	var sr bilibiliSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, fmt.Errorf("bilibili search: decode response: %w", err)
	}
	if sr.Code != 0 {
		return nil, fmt.Errorf("bilibili search: API error code %d", sr.Code)
	}

	results := make([]SearchResult, 0, len(sr.Data.Result))
	for _, r := range sr.Data.Result {
		results = append(results, SearchResult{
			VideoID:      r.BVID,
			Title:        stripHTMLTags(r.Title),
			DanmakuCount: r.Danmaku,
			Duration:     r.Duration,
			Thumbnail:    fixProtocol(r.Pic),
		})
	}
	return results, nil
}

// bilibiliViewResponse is the API response for video detail (to get CID).
type bilibiliViewResponse struct {
	Code int `json:"code"`
	Data struct {
		CID int64 `json:"cid"`
	} `json:"data"`
}

func (b *BilibiliSource) FetchDanmaku(ctx context.Context, videoID string) ([]Comment, error) {
	cid, err := b.getCID(ctx, videoID)
	if err != nil {
		return nil, err
	}

	danmakuURL := fmt.Sprintf("%s/%d.xml", bilibiliDanmakuURL, cid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, danmakuURL, nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: create request: %w", err)
	}
	req.Header.Set("User-Agent", bilibiliUserAgent)

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: read body: %w", err)
	}

	return parseBilibiliXML(body)
}

func (b *BilibiliSource) getCID(ctx context.Context, bvid string) (int64, error) {
	u, _ := url.Parse(bilibiliViewURL)
	q := u.Query()
	q.Set("bvid", bvid)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return 0, fmt.Errorf("bilibili getCID: create request: %w", err)
	}
	req.Header.Set("User-Agent", bilibiliUserAgent)

	resp, err := b.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("bilibili getCID: %w", err)
	}
	defer resp.Body.Close()

	var vr bilibiliViewResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return 0, fmt.Errorf("bilibili getCID: decode response: %w", err)
	}
	if vr.Code != 0 {
		return 0, fmt.Errorf("bilibili getCID: API error code %d", vr.Code)
	}
	return vr.Data.CID, nil
}

// XML structures for Bilibili danmaku.
type bilibiliXMLRoot struct {
	XMLName xml.Name          `xml:"i"`
	Items   []bilibiliXMLItem `xml:"d"`
}

type bilibiliXMLItem struct {
	P    string `xml:"p,attr"`
	Text string `xml:",chardata"`
}

// parseBilibiliXML parses Bilibili's danmaku XML format.
// Each <d> element has a "p" attribute: "time,mode,fontSize,color,timestamp,pool,userHash,dmid"
// Mode mapping: 1,6 → "rtl", 4 → "bottom", 5 → "top"
// Color: decimal integer → "#xxxxxx" hex string
func parseBilibiliXML(data []byte) ([]Comment, error) {
	var root bilibiliXMLRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse bilibili XML: %w", err)
	}

	comments := make([]Comment, 0, len(root.Items))
	for _, item := range root.Items {
		parts := strings.Split(item.P, ",")
		if len(parts) < 4 {
			continue // skip malformed entries
		}

		time, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			continue
		}

		modeInt, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}

		colorInt, err := strconv.ParseInt(parts[3], 10, 64)
		if err != nil {
			continue
		}

		comments = append(comments, Comment{
			Text:  item.Text,
			Time:  time,
			Mode:  mapBilibiliMode(modeInt),
			Color: fmt.Sprintf("#%06x", colorInt),
		})
	}

	return comments, nil
}

// mapBilibiliMode converts Bilibili's numeric mode to a string.
func mapBilibiliMode(mode int) string {
	switch mode {
	case 4:
		return "bottom"
	case 5:
		return "top"
	default:
		return "rtl"
	}
}

// fixProtocol adds "https:" to protocol-relative URLs (//i0.hdslb.com/...).
func fixProtocol(u string) string {
	if strings.HasPrefix(u, "//") {
		return "https:" + u
	}
	return u
}

var htmlTagRegexp = regexp.MustCompile(`<[^>]*>`)

// stripHTMLTags removes HTML tags from a string (Bilibili returns <em> in search titles).
func stripHTMLTags(s string) string {
	return htmlTagRegexp.ReplaceAllString(s, "")
}
