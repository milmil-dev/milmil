package danmaku

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

const (
	bilibiliSearchURL  = "https://api.bilibili.com/x/web-interface/search/type"
	bilibiliViewURL    = "https://api.bilibili.com/x/web-interface/view"
	bilibiliDanmakuURL = "https://comment.bilibili.com"
	bilibiliUserAgent  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

// BilibiliSource implements Source for Bilibili danmaku.
type BilibiliSource struct {
	client  *http.Client
	buvid3  string
	buvidMu sync.Once
}

// NewBilibiliSource creates a new BilibiliSource with the given HTTP client.
func NewBilibiliSource(c *http.Client) *BilibiliSource {
	if c == nil {
		c = http.DefaultClient
	}
	return &BilibiliSource{client: c}
}

// initBuvid fetches a buvid3 session token from Bilibili's SPI endpoint.
// Without this cookie, Bilibili returns 412 for many API requests.
func (b *BilibiliSource) initBuvid() {
	b.buvidMu.Do(func() {
		resp, err := b.client.Get("https://api.bilibili.com/x/frontend/finger/spi")
		if err != nil {
			slog.Warn("bilibili: failed to fetch buvid", "err", err)
			return
		}
		defer resp.Body.Close()

		var result struct {
			Data struct {
				B3 string `json:"b_3"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && result.Data.B3 != "" {
			b.buvid3 = result.Data.B3
			slog.Debug("bilibili: acquired buvid3", "buvid3", b.buvid3[:8]+"...")
		}
	})
}

// setHeaders adds required headers to bypass Bilibili's anti-bot (412).
func (b *BilibiliSource) setHeaders(req *http.Request) {
	b.initBuvid()
	req.Header.Set("User-Agent", bilibiliUserAgent)
	req.Header.Set("Referer", "https://www.bilibili.com")
	if b.buvid3 != "" {
		req.Header.Set("Cookie", "buvid3="+b.buvid3)
	}
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
	b.setHeaders(req)

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

// bilibiliViewResponse is the API response for video detail (to get CID and pages).
type bilibiliViewResponse struct {
	Code int `json:"code"`
	Data struct {
		CID   int64 `json:"cid"`
		Pages []struct {
			CID      int64  `json:"cid"`
			Page     int    `json:"page"`
			Part     string `json:"part"`
			Duration int    `json:"duration"`
		} `json:"pages"`
	} `json:"data"`
}

func (b *BilibiliSource) GetParts(ctx context.Context, videoID string) ([]VideoPart, error) {
	vr, err := b.getVideoInfo(ctx, videoID)
	if err != nil {
		return nil, err
	}

	parts := make([]VideoPart, 0, len(vr.Data.Pages))
	for i, p := range vr.Data.Pages {
		parts = append(parts, VideoPart{
			Index:    i,
			Title:    p.Part,
			Duration: p.Duration,
		})
	}
	// If no pages returned, synthesize a single part from the top-level CID
	if len(parts) == 0 {
		parts = append(parts, VideoPart{Index: 0, Title: "", Duration: 0})
	}
	return parts, nil
}

func (b *BilibiliSource) FetchDanmaku(ctx context.Context, videoID string, partIndex int) ([]Comment, error) {
	vr, err := b.getVideoInfo(ctx, videoID)
	if err != nil {
		return nil, err
	}

	// Resolve cid for the requested part
	var cid int64
	if len(vr.Data.Pages) > 0 {
		if partIndex < 0 || partIndex >= len(vr.Data.Pages) {
			partIndex = 0
		}
		cid = vr.Data.Pages[partIndex].CID
	} else {
		cid = vr.Data.CID
	}
	if cid == 0 {
		return nil, fmt.Errorf("bilibili: no cid for %s part %d", videoID, partIndex)
	}

	danmakuURL := fmt.Sprintf("%s/%d.xml", bilibiliDanmakuURL, cid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, danmakuURL, nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: create request: %w", err)
	}
	b.setHeaders(req)

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

func (b *BilibiliSource) getVideoInfo(ctx context.Context, bvid string) (*bilibiliViewResponse, error) {
	u, _ := url.Parse(bilibiliViewURL)
	q := u.Query()
	q.Set("bvid", bvid)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili view: create request: %w", err)
	}
	b.setHeaders(req)

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili view: %w", err)
	}
	defer resp.Body.Close()

	var vr bilibiliViewResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return nil, fmt.Errorf("bilibili view: decode response: %w", err)
	}
	if vr.Code != 0 {
		return nil, fmt.Errorf("bilibili view: API error code %d", vr.Code)
	}
	return &vr, nil
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
	// Bilibili XML often contains bare '&' in danmaku text (invalid XML).
	// Use a decoder with Strict=false + AutoClose to handle it gracefully.
	decoder := xml.NewDecoder(strings.NewReader(string(data)))
	decoder.Strict = false
	decoder.AutoClose = xml.HTMLAutoClose
	decoder.Entity = xml.HTMLEntity

	var root bilibiliXMLRoot
	if err := decoder.Decode(&root); err != nil {
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
