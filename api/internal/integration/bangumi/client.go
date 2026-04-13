package bangumi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"unicode/utf8"
)

var (
	ErrNotFound    = errors.New("bangumi: not found")
	ErrRateLimited = errors.New("bangumi: rate limited")
	ErrUnavailable = errors.New("bangumi: service unavailable")
)

const defaultBaseURL = "https://api.bgm.tv"
const nextBaseURL = "https://next.bgm.tv"

type Client interface {
	SearchSubjects(ctx context.Context, query string, opts ...SearchOption) ([]Subject, error)
	SearchByTag(ctx context.Context, tags []string, sort string, page, limit int) ([]Subject, int, error)
	GetCalendar(ctx context.Context) ([]CalendarDay, error)
	GetSubject(ctx context.Context, id int) (*Subject, error)
	GetSubjectEpisodes(ctx context.Context, subjectID int) ([]Episode, error)
	GetSubjectComments(ctx context.Context, subjectID int, limit int) ([]SubjectComment, error)
}

type httpClient struct {
	http    *http.Client
	ua      string
	baseURL string
}

func NewClient(c *http.Client, userAgent string) Client {
	return &httpClient{http: c, ua: userAgent, baseURL: defaultBaseURL}
}

// NewClientWithURL creates a client with a custom base URL (for testing).
func NewClientWithURL(c *http.Client, userAgent string, url string) Client {
	return &httpClient{http: c, ua: userAgent, baseURL: url}
}

func (c *httpClient) do(ctx context.Context, method, path string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.ua)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return data, nil
	case http.StatusNotFound:
		return nil, ErrNotFound
	case http.StatusTooManyRequests:
		return nil, ErrRateLimited
	default:
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}
}

// SearchOption configures optional search behaviour.
type SearchOption func(m map[string]any)

// WithNSFW includes NSFW subjects in the search results.
func WithNSFW() SearchOption {
	return func(m map[string]any) {
		filter := m["filter"].(map[string]any)
		filter["nsfw"] = true
	}
}

func (c *httpClient) SearchSubjects(ctx context.Context, query string, opts ...SearchOption) ([]Subject, error) {
	body := map[string]any{
		"keyword": query,
		"filter":  map[string]any{"type": []int{2}},
	}
	for _, opt := range opts {
		opt(body)
	}
	reqBody, _ := json.Marshal(body)
	data, err := c.do(ctx, http.MethodPost, "/v0/search/subjects", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	var result SearchResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

// t2sMap converts common Traditional Chinese characters to Simplified for Bangumi API.
var t2sMap = map[rune]rune{
	'龍': '龙', '戀': '恋', '愛': '爱', '後': '后', '宮': '宫', '戰': '战', '鬥': '斗',
	'險': '险', '懸': '悬', '機': '机', '運': '运', '動': '动', '異': '异', '轉': '转',
	'歷': '历', '軍': '军', '劇': '剧', '會': '会', '賽': '赛', '釣': '钓', '營': '营',
	'聲': '声', '優': '优', '續': '续', '場': '场', '書': '书', '說': '说', '輕': '轻',
	'遊': '游', '戲': '戏', '編': '编', '畫': '画', '創': '创', '癒': '愈', '淚': '泪',
	'鬱': '郁', '勵': '励', '誌': '志', '蓮': '莲', '園': '园', '職': '职', '樂': '乐',
	'體': '体', '開': '开', '門': '门', '間': '间', '車': '车', '東': '东', '飄': '飘',
	'熱': '热', '鑰': '钥', '陣': '阵', '華': '华', '國': '国', '島': '岛', '來': '来',
	'與': '与', '為': '为', '從': '从', '們': '们', '個': '个', '這': '这', '裡': '里',
	'點': '点', '長': '长', '電': '电', '話': '话', '記': '记', '學': '学', '問': '问',
}

func convertT2S(s string) string {
	out := make([]rune, 0, utf8.RuneCountInString(s))
	for _, r := range s {
		if mapped, ok := t2sMap[r]; ok {
			out = append(out, mapped)
		} else {
			out = append(out, r)
		}
	}
	return string(out)
}

func (c *httpClient) SearchByTag(ctx context.Context, tags []string, sort string, page, limit int) ([]Subject, int, error) {
	// Bangumi uses simplified Chinese tags; convert any traditional input.
	simplified := make([]string, len(tags))
	for i, tag := range tags {
		simplified[i] = convertT2S(tag)
	}
	filter := map[string]any{
		"type": []int{2}, // anime only
		"tag":  simplified,
	}
	if sort == "" {
		sort = "rank"
	}
	offset := (page - 1) * limit
	reqBody, _ := json.Marshal(map[string]any{
		"keyword": "",
		"filter":  filter,
		"sort":    sort,
	})
	// Bangumi requires limit/offset as query params, not body fields.
	path := fmt.Sprintf("/v0/search/subjects?limit=%d&offset=%d", limit, offset)
	data, err := c.do(ctx, http.MethodPost, path, bytes.NewReader(reqBody))
	if err != nil {
		return nil, 0, err
	}
	var result SearchResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, 0, err
	}
	return result.Data, result.Total, nil
}

func (c *httpClient) GetCalendar(ctx context.Context) ([]CalendarDay, error) {
	data, err := c.do(ctx, http.MethodGet, "/calendar", nil)
	if err != nil {
		return nil, err
	}
	var days []CalendarDay
	if err := json.Unmarshal(data, &days); err != nil {
		return nil, err
	}
	return days, nil
}

func (c *httpClient) GetSubject(ctx context.Context, id int) (*Subject, error) {
	data, err := c.do(ctx, http.MethodGet, "/v0/subjects/"+strconv.Itoa(id), nil)
	if err != nil {
		return nil, err
	}
	var s Subject
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (c *httpClient) GetSubjectEpisodes(ctx context.Context, subjectID int) ([]Episode, error) {
	data, err := c.do(ctx, http.MethodGet, "/v0/episodes?subject_id="+strconv.Itoa(subjectID)+"&type=0", nil)
	if err != nil {
		return nil, err
	}
	var result EpisodeList
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *httpClient) GetSubjectComments(ctx context.Context, subjectID int, limit int) ([]SubjectComment, error) {
	url := nextBaseURL + "/p1/subjects/" + strconv.Itoa(subjectID) + "/comments?limit=" + strconv.Itoa(limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.ua)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bangumi comments: status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result CommentList
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}
