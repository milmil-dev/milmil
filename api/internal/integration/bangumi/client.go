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
)

var (
	ErrNotFound    = errors.New("bangumi: not found")
	ErrRateLimited = errors.New("bangumi: rate limited")
	ErrUnavailable = errors.New("bangumi: service unavailable")
)

const defaultBaseURL = "https://api.bgm.tv"
const nextBaseURL = "https://next.bgm.tv"

type Client interface {
	SearchSubjects(ctx context.Context, query string) ([]Subject, error)
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

func (c *httpClient) SearchSubjects(ctx context.Context, query string) ([]Subject, error) {
	reqBody, _ := json.Marshal(map[string]any{
		"keyword": query,
		"filter":  map[string]any{"type": []int{2}},
	})
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
