package danmaku

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	bilibiliDanmakuURL = "https://comment.bilibili.com"
	bilibiliUserAgent  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

// BilibiliSource implements Source for Bilibili danmaku.
//
// Bilibili's web search sits behind its "gaia" risk control: a request needs
// a device identity (buvid3/buvid4/b_nut/_uuid cookies) that has been
// activated once through ExClimbWuzhi, and the query must carry a WBI
// signature (w_rid/wts) derived from keys that rotate daily. Without all of
// that the API answers with an HTML block page or a `v_voucher` captcha
// ticket instead of results.
type BilibiliSource struct {
	client   *http.Client
	apiBase  string
	cdnBase  string
	mu       sync.Mutex
	session  *bilibiliSession
	sessions int // sessions created; tests use it to see a reset
}

type bilibiliSession struct {
	cookie   string
	mixinKey string
	created  time.Time
}

// bilibiliSessionTTL bounds how long a device identity and its WBI keys are
// reused; the keys rotate daily, so anything under that is safe.
const bilibiliSessionTTL = 6 * time.Hour

// NewBilibiliSource creates a new BilibiliSource with the given HTTP client.
func NewBilibiliSource(c *http.Client) *BilibiliSource {
	if c == nil {
		c = http.DefaultClient
	}
	return &BilibiliSource{client: c, apiBase: "https://api.bilibili.com", cdnBase: bilibiliDanmakuURL}
}

// getSession returns the cached device identity, building a fresh one when
// there is none or it has aged out.
func (b *BilibiliSource) getSession(ctx context.Context) (*bilibiliSession, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.session != nil && time.Since(b.session.created) < bilibiliSessionTTL {
		return b.session, nil
	}
	sess, err := b.newSession(ctx)
	if err != nil {
		return nil, err
	}
	b.session = sess
	b.sessions++
	return sess, nil
}

// resetSession drops the cached identity so the next call registers a new
// one — the response to a block page or a captcha voucher.
func (b *BilibiliSource) resetSession() {
	b.mu.Lock()
	b.session = nil
	b.mu.Unlock()
}

func (b *BilibiliSource) newSession(ctx context.Context) (*bilibiliSession, error) {
	// 1. Device IDs from the fingerprint SPI endpoint.
	var spi struct {
		Data struct {
			B3 string `json:"b_3"`
			B4 string `json:"b_4"`
		} `json:"data"`
	}
	if err := b.getJSON(ctx, b.apiBase+"/x/frontend/finger/spi", "", &spi); err != nil {
		return nil, fmt.Errorf("bilibili: fetch buvid: %w", err)
	}
	if spi.Data.B3 == "" {
		return nil, errors.New("bilibili: fetch buvid: empty buvid3")
	}
	now := time.Now()
	cookie := fmt.Sprintf("buvid3=%s; buvid4=%s; b_nut=%d; _uuid=%s",
		spi.Data.B3, spi.Data.B4, now.Unix(), bilibiliUUID(now))

	// 2. Activate the identity. Failure here is not fatal — the search
	// itself reports whether risk control accepted us.
	if err := b.activate(ctx, cookie, spi.Data.B3); err != nil {
		slog.Warn("bilibili: device activation failed", "err", err)
	}

	// 3. WBI signing keys.
	var nav struct {
		Data struct {
			WbiImg struct {
				ImgURL string `json:"img_url"`
				SubURL string `json:"sub_url"`
			} `json:"wbi_img"`
		} `json:"data"`
	}
	if err := b.getJSON(ctx, b.apiBase+"/x/web-interface/nav", cookie, &nav); err != nil {
		return nil, fmt.Errorf("bilibili: fetch wbi keys: %w", err)
	}
	mixin := wbiMixinKey(wbiKeyFromURL(nav.Data.WbiImg.ImgURL), wbiKeyFromURL(nav.Data.WbiImg.SubURL))
	if mixin == "" {
		return nil, errors.New("bilibili: fetch wbi keys: missing wbi_img")
	}
	slog.Debug("bilibili: session ready", "buvid3", spi.Data.B3[:min(8, len(spi.Data.B3))]+"...")
	return &bilibiliSession{cookie: cookie, mixinKey: mixin, created: now}, nil
}

// activate posts the ExClimbWuzhi fingerprint the web client sends on first
// load; the payload only needs to be well-formed for gaia to mark the buvid
// as a real browser.
func (b *BilibiliSource) activate(ctx context.Context, cookie, buvid3 string) error {
	fingerprint := map[string]any{
		"3064": 1,
		"5062": strconv.FormatInt(time.Now().UnixMilli(), 10),
		"03bf": "https://www.bilibili.com/",
		"39c8": "333.1007.fp.risk",
		"6e7c": "1920x1080",
		"3c43": map[string]any{
			"2673": 0, "5766": 24, "6527": 0, "7003": 1, "807e": 1,
			"b8ce": bilibiliUserAgent, "641c": 0, "07a4": "zh-CN",
			"1c57": "not available", "0bd0": 8, "725f": "1920x1080",
			"3872": "24", "2e5c": "1920x1080", "f5e6": "20", "2ad2": "-480",
			"c72c": "20", "2b1b": "1", "c7e2": "true", "3f02": "Win32", "8a67": "false",
		},
		"54ef": "{}",
		"df35": buvid3,
		"07a4": "zh-CN",
		"db46": 0,
	}
	inner, _ := json.Marshal(fingerprint)
	body, _ := json.Marshal(map[string]string{"payload": string(inner)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.apiBase+"/x/internal/gaia-gateway/ExClimbWuzhi", bytes.NewReader(body))
	if err != nil {
		return err
	}
	b.setHeaders(req, cookie)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://www.bilibili.com")
	resp, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

// getJSON performs a GET with the browser headers and decodes JSON, turning
// an HTML block page into a readable error.
func (b *BilibiliSource) getJSON(ctx context.Context, rawURL, cookie string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	b.setHeaders(req, cookie)
	resp, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if errBlocked := bilibiliBlocked(resp, data); errBlocked != nil {
		return errBlocked
	}
	return json.Unmarshal(data, out)
}

// errBilibiliBlocked marks a response from risk control rather than the
// API; callers drop their session and start over.
var errBilibiliBlocked = errors.New("bilibili: request blocked by risk control")

func bilibiliBlocked(resp *http.Response, data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if resp.StatusCode == http.StatusPreconditionFailed || bytes.HasPrefix(trimmed, []byte("<")) {
		return fmt.Errorf("%w (status %d)", errBilibiliBlocked, resp.StatusCode)
	}
	return nil
}

// setHeaders adds the browser identity Bilibili's anti-bot expects.
func (b *BilibiliSource) setHeaders(req *http.Request, cookie string) {
	req.Header.Set("User-Agent", bilibiliUserAgent)
	req.Header.Set("Referer", "https://www.bilibili.com")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
}

// bilibiliUUID mimics the web client's `_uuid` cookie: an upper-case UUID,
// five digits of the millisecond clock, and the "infoc" suffix.
func bilibiliUUID(now time.Time) string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		binary.BigEndian.PutUint64(raw[:8], uint64(now.UnixNano()))
	}
	hexs := strings.ToUpper(hex.EncodeToString(raw[:]))
	return fmt.Sprintf("%s-%s-%s-%s-%s%05dinfoc",
		hexs[0:8], hexs[8:12], hexs[12:16], hexs[16:20], hexs[20:32], now.UnixMilli()%100000)
}

func (b *BilibiliSource) Name() string {
	return "bilibili"
}

// bilibiliSearchResponse is the top-level API response for search.
type bilibiliSearchResponse struct {
	Code int `json:"code"`
	Data struct {
		Result  []bilibiliSearchResult `json:"result"`
		Voucher string                 `json:"v_voucher"`
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
	sr, err := b.search(ctx, keyword, page)
	if errors.Is(err, errBilibiliBlocked) {
		// A stale or unactivated identity; register a new one and try once more.
		b.resetSession()
		sr, err = b.search(ctx, keyword, page)
	}
	if err != nil {
		return nil, err
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

// search performs one signed request against the WBI search endpoint.
func (b *BilibiliSource) search(ctx context.Context, keyword string, page int) (*bilibiliSearchResponse, error) {
	sess, err := b.getSession(ctx)
	if err != nil {
		return nil, err
	}
	params := url.Values{}
	params.Set("search_type", "video")
	params.Set("keyword", keyword)
	params.Set("page", strconv.Itoa(page))
	u, _ := url.Parse(b.apiBase + "/x/web-interface/wbi/search/type")
	u.RawQuery = wbiSign(params, sess.mixinKey, time.Now()).Encode()

	var sr bilibiliSearchResponse
	if err := b.getJSON(ctx, u.String(), sess.cookie, &sr); err != nil {
		return nil, fmt.Errorf("bilibili search: %w", err)
	}
	switch {
	case sr.Code == -412 || sr.Code == -403:
		return nil, fmt.Errorf("bilibili search: %w (code %d)", errBilibiliBlocked, sr.Code)
	case sr.Code != 0:
		return nil, fmt.Errorf("bilibili search: API error code %d", sr.Code)
	case sr.Data.Voucher != "" && len(sr.Data.Result) == 0:
		// A captcha ticket in place of results: the identity was not accepted.
		return nil, fmt.Errorf("bilibili search: %w (captcha voucher)", errBilibiliBlocked)
	}
	return &sr, nil
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

	danmakuURL := fmt.Sprintf("%s/%d.xml", b.cdnBase, cid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, danmakuURL, nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: create request: %w", err)
	}
	cookie := ""
	if sess, sessErr := b.getSession(ctx); sessErr == nil {
		cookie = sess.cookie
	}
	b.setHeaders(req, cookie)

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: %w", err)
	}
	defer resp.Body.Close()

	// Bilibili always sends compressed responses (gzip/deflate) for danmaku XML,
	// even when Accept-Encoding is not set. Decompress based on Content-Encoding.
	var reader io.Reader = resp.Body
	switch resp.Header.Get("Content-Encoding") {
	case "gzip":
		gr, gzErr := gzip.NewReader(resp.Body)
		if gzErr != nil {
			return nil, fmt.Errorf("bilibili danmaku: gzip: %w", gzErr)
		}
		defer gr.Close()
		reader = gr
	case "deflate":
		reader = flate.NewReader(resp.Body)
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku: read body: %w", err)
	}

	return parseBilibiliXML(body)
}

func (b *BilibiliSource) getVideoInfo(ctx context.Context, bvid string) (*bilibiliViewResponse, error) {
	sess, err := b.getSession(ctx)
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(b.apiBase + "/x/web-interface/view")
	q := u.Query()
	q.Set("bvid", bvid)
	u.RawQuery = q.Encode()

	var vr bilibiliViewResponse
	if err := b.getJSON(ctx, u.String(), sess.cookie, &vr); err != nil {
		if errors.Is(err, errBilibiliBlocked) {
			b.resetSession()
		}
		return nil, fmt.Errorf("bilibili view: %w", err)
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
