// api/internal/integration/dandanplay/fallback.go
package dandanplay

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
)

// fallbackClient reads from a self-hosted danmu_api-style proxy when the
// official network is unreachable or no credentials are configured. It is
// strictly opt-in (an empty fallbackURL yields the plain official client) and
// never kicks in on a 429: a quota or rate limit from 弹弹play is a signal to
// back off, not to route around.
type fallbackClient struct {
	official Client
	fallback Client
}

func NewFallbackClient(httpClient *http.Client, credFn CredentialsFn, officialURL, fallbackURL string) Client {
	if officialURL == "" {
		officialURL = defaultBaseURL
	}
	official := NewClientWithURL(httpClient, credFn, officialURL)
	if fallbackURL == "" {
		return official
	}
	noopCredFn := func(ctx context.Context) (string, string, error) {
		return "noop", "noop", nil
	}
	return &fallbackClient{
		official: official,
		fallback: NewClientWithURL(httpClient, noopCredFn, fallbackURL),
	}
}

func shouldFallback(err error) bool {
	return errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrUnavailable)
}

func (c *fallbackClient) GetComments(ctx context.Context, episodeID int64) ([]Comment, error) {
	comments, err := c.official.GetComments(ctx, episodeID)
	if err == nil {
		return comments, nil
	}
	if shouldFallback(err) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.GetComments(ctx, episodeID)
	}
	return nil, err
}

func (c *fallbackClient) MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error) {
	result, err := c.official.MatchFile(ctx, fileName, fileHash, fileSize, videoDuration)
	if err == nil {
		return result, nil
	}
	if shouldFallback(err) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.MatchFile(ctx, fileName, fileHash, fileSize, videoDuration)
	}
	return nil, err
}

func (c *fallbackClient) MatchFiles(ctx context.Context, reqs []MatchRequest) (map[string]Match, error) {
	matches, err := c.official.MatchFiles(ctx, reqs)
	if err == nil {
		return matches, nil
	}
	if shouldFallback(err) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.MatchFiles(ctx, reqs)
	}
	return nil, err
}

func (c *fallbackClient) PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error {
	return c.official.PostComment(ctx, episodeID, req)
}

func (c *fallbackClient) GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error) {
	info, err := c.official.GetBangumiInfo(ctx, dandanplayAnimeID)
	if err == nil {
		return info, nil
	}
	if shouldFallback(err) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.GetBangumiInfo(ctx, dandanplayAnimeID)
	}
	return nil, err
}
