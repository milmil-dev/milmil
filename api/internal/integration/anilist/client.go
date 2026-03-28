package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var (
	ErrQueryFailed = errors.New("anilist: query failed")
	ErrRateLimited = errors.New("anilist: rate limited")
	ErrUnavailable = errors.New("anilist: service unavailable")
)

const defaultEndpoint = "https://graphql.anilist.co"

const mediaFields = `
	id
	title { romaji english native }
	description(asHtml: false)
	coverImage { extraLarge large }
	bannerImage
	trailer { id site }
	popularity averageScore episodes status season seasonYear format
	genres
`

const mediaFieldsWithRelations = mediaFields + `
	relations {
		edges {
			relationType
			node {` + mediaFields + `}
		}
	}
	recommendations(sort: RATING_DESC, perPage: 8) {
		nodes {
			mediaRecommendation {` + mediaFields + `}
		}
	}
	reviews(limit: 10, sort: RATING_DESC) {
		nodes {
			id summary score rating ratingAmount
			user { name avatar { medium } }
		}
	}
`

type Client interface {
	SearchMedia(ctx context.Context, query string) ([]Media, error)
	GetMedia(ctx context.Context, id int) (*Media, error)
	GetTrending(ctx context.Context, page, perPage int) ([]Media, error)
	BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]Media, error)
}

type graphqlClient struct {
	http     *http.Client
	endpoint string
}

func NewClient(c *http.Client) Client {
	return &graphqlClient{http: c, endpoint: defaultEndpoint}
}

func NewClientWithURL(c *http.Client, endpoint string) Client {
	return &graphqlClient{http: c, endpoint: endpoint}
}

type graphqlRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

type graphqlResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func (c *graphqlClient) query(ctx context.Context, q string, vars map[string]any, target any) error {
	body, _ := json.Marshal(graphqlRequest{Query: q, Variables: vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return ErrRateLimited
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}

	var gqlResp graphqlResponse
	if err := json.Unmarshal(data, &gqlResp); err != nil {
		return err
	}
	if len(gqlResp.Errors) > 0 {
		return fmt.Errorf("%w: %s", ErrQueryFailed, gqlResp.Errors[0].Message)
	}

	return json.Unmarshal(gqlResp.Data, target)
}

func (c *graphqlClient) SearchMedia(ctx context.Context, search string) ([]Media, error) {
	q := `query ($search: String) {
		Page(perPage: 20) {
			media(search: $search, type: ANIME, sort: SEARCH_MATCH) {` + mediaFields + `}
		}
	}`
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, map[string]any{"search": search}, &result); err != nil {
		return nil, err
	}
	return result.Page.Media, nil
}

func (c *graphqlClient) GetMedia(ctx context.Context, id int) (*Media, error) {
	q := `query ($id: Int) {
		Media(id: $id, type: ANIME) {` + mediaFieldsWithRelations + `}
	}`
	var result struct {
		Media Media `json:"Media"`
	}
	if err := c.query(ctx, q, map[string]any{"id": id}, &result); err != nil {
		return nil, err
	}
	return &result.Media, nil
}

func (c *graphqlClient) BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]Media, error) {
	q := `query ($genre: String, $page: Int, $perPage: Int) {
		Page(page: $page, perPage: $perPage) {
			media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) {` + mediaFields + `}
		}
	}`
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, map[string]any{"genre": genre, "page": page, "perPage": perPage}, &result); err != nil {
		return nil, err
	}
	return result.Page.Media, nil
}

func (c *graphqlClient) GetTrending(ctx context.Context, page, perPage int) ([]Media, error) {
	q := `query ($page: Int, $perPage: Int) {
		Page(page: $page, perPage: $perPage) {
			media(type: ANIME, sort: TRENDING_DESC) {` + mediaFields + `}
		}
	}`
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, map[string]any{"page": page, "perPage": perPage}, &result); err != nil {
		return nil, err
	}
	return result.Page.Media, nil
}
