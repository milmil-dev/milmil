// api/internal/integration/dandanplay/client.go
package dandanplay

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
	ErrNoCredentials = errors.New("dandanplay: no credentials configured")
	ErrAPIError      = errors.New("dandanplay: API error")
	ErrRateLimited   = errors.New("dandanplay: rate limited")
	ErrUnavailable   = errors.New("dandanplay: service unavailable")
)

const defaultBaseURL = "https://api.dandanplay.net"

type CredentialsFn func(ctx context.Context) (appID, appSecret string, err error)

type Client interface {
	MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error)
	GetComments(ctx context.Context, episodeID int64) ([]Comment, error)
	PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error
	GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error)
}

type httpClient struct {
	http    *http.Client
	credFn  CredentialsFn
	baseURL string
}

func NewClient(c *http.Client, credFn CredentialsFn) Client {
	return &httpClient{http: c, credFn: credFn, baseURL: defaultBaseURL}
}

func NewClientWithURL(c *http.Client, credFn CredentialsFn, url string) Client {
	return &httpClient{http: c, credFn: credFn, baseURL: url}
}

func (c *httpClient) do(ctx context.Context, method, path string, body io.Reader) ([]byte, error) {
	appID, appSecret, err := c.credFn(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNoCredentials, err)
	}
	if appID == "" || appSecret == "" {
		return nil, ErrNoCredentials
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-AppId", appID)
	req.Header.Set("X-AppSecret", appSecret)
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

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}

	return data, nil
}

func (c *httpClient) MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error) {
	reqBody, _ := json.Marshal(matchRequest{
		FileName:      fileName,
		FileHash:      fileHash,
		FileSize:      fileSize,
		VideoDuration: videoDuration,
		MatchMode:     "hashAndFileName",
	})
	data, err := c.do(ctx, http.MethodPost, "/api/v2/match", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	var resp matchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	if resp.ErrorCode != 0 {
		return nil, fmt.Errorf("%w: %s", ErrAPIError, resp.ErrorMessage)
	}
	return &MatchResult{IsMatched: resp.IsMatched, Matches: resp.Matches}, nil
}

func (c *httpClient) GetComments(ctx context.Context, episodeID int64) ([]Comment, error) {
	path := "/api/v2/comment/" + strconv.FormatInt(episodeID, 10) + "?withRelated=true"
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	var resp commentResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Comments, nil
}

func (c *httpClient) PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error {
	body, _ := json.Marshal(req)
	path := "/api/v2/comment/" + strconv.FormatInt(episodeID, 10)
	_, err := c.do(ctx, http.MethodPost, path, bytes.NewReader(body))
	return err
}

func (c *httpClient) GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error) {
	path := "/api/v2/bangumi/" + strconv.FormatInt(dandanplayAnimeID, 10)
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	var resp bangumiInfoResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	if resp.ErrorCode != 0 {
		return nil, fmt.Errorf("%w: %s", ErrAPIError, resp.ErrorMessage)
	}
	return &BangumiInfo{
		AnimeID:    dandanplayAnimeID,
		AnimeTitle: resp.AnimeTitle,
		BangumiID:  resp.BangumiID,
	}, nil
}
