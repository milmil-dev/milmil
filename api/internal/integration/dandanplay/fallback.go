// api/internal/integration/dandanplay/fallback.go
package dandanplay

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
)

const defaultFallbackURL = "https://api.danmu.icu/87654321"

type fallbackClient struct {
	official Client
	fallback Client
}

func NewFallbackClient(httpClient *http.Client, credFn CredentialsFn, officialURL, fallbackURL string) Client {
	if officialURL == "" {
		officialURL = defaultBaseURL
	}
	if fallbackURL == "" {
		fallbackURL = defaultFallbackURL
	}
	noopCredFn := func(ctx context.Context) (string, string, error) {
		return "noop", "noop", nil
	}
	return &fallbackClient{
		official: NewClientWithURL(httpClient, credFn, officialURL),
		fallback: NewClientWithURL(httpClient, noopCredFn, fallbackURL),
	}
}

func (c *fallbackClient) GetComments(ctx context.Context, episodeID int64) ([]Comment, error) {
	comments, err := c.official.GetComments(ctx, episodeID)
	if err == nil {
		return comments, nil
	}
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
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
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.MatchFile(ctx, fileName, fileHash, fileSize, videoDuration)
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
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.GetBangumiInfo(ctx, dandanplayAnimeID)
	}
	return nil, err
}
