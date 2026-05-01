package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/time/rate"
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
	isAdult genres
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
	characters(sort: [ROLE, RELEVANCE], perPage: 10) {
		edges {
			role
			node {
				id
				name { full native }
				image { medium }
			}
			voiceActors(language: JAPANESE) {
				id
				name { full native }
				image { medium }
			}
		}
	}
`

// BrowseFilter holds optional filters for the Browse query.
type BrowseFilter struct {
	Genre    string   // AniList genre name (e.g. "Action") — single genre (legacy)
	Genres   []string // Multiple genre names — uses genre_in when len > 1
	Sort     string   // AniList MediaSort enum value (e.g. "POPULARITY_DESC", "SCORE_DESC")
	Year     int      // seasonYear filter (e.g. 2024)
	Season   string   // AniList MediaSeason enum (WINTER, SPRING, SUMMER, FALL)
	MinScore int      // averageScore_greater (0-100 scale)
	Status   string   // AniList MediaStatus enum (FINISHED, RELEASING, NOT_YET_RELEASED)
	Format   string   // AniList MediaFormat enum (TV, MOVIE, OVA, ONA, SPECIAL, TV_SHORT)
	IsAdult  bool     // Include adult content
}

type Client interface {
	SearchMedia(ctx context.Context, query string, isAdult bool) ([]Media, error)
	GetMedia(ctx context.Context, id int) (*Media, error)
	GetTrending(ctx context.Context, page, perPage int) ([]Media, error)
	BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]Media, error)
	Browse(ctx context.Context, filter BrowseFilter, page, perPage int) ([]Media, error)
	GetAiringSchedule(ctx context.Context, from, to int64) ([]AiringSchedule, error)
	GetMediaRelations(ctx context.Context, id int) (*Media, error)
}

type graphqlClient struct {
	http     *http.Client
	endpoint string
	limiter  *rate.Limiter
}

func NewClient(c *http.Client) Client {
	return &graphqlClient{http: c, endpoint: defaultEndpoint, limiter: rate.NewLimiter(rate.Every(700*time.Millisecond), 1)}
}

func NewClientWithURL(c *http.Client, endpoint string) Client {
	return &graphqlClient{http: c, endpoint: endpoint, limiter: rate.NewLimiter(rate.Every(700*time.Millisecond), 1)}
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
	if err := c.limiter.Wait(ctx); err != nil {
		return fmt.Errorf("%w: %v", ErrRateLimited, err)
	}
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

func (c *graphqlClient) SearchMedia(ctx context.Context, search string, isAdult bool) ([]Media, error) {
	varDefs := "$search: String"
	mediaArgs := "search: $search, type: ANIME, sort: SEARCH_MATCH"
	vars := map[string]any{"search": search}
	if isAdult {
		varDefs += ", $isAdult: Boolean"
		mediaArgs += ", isAdult: $isAdult"
		vars["isAdult"] = true
	}
	q := fmt.Sprintf(`query (%s) {
		Page(perPage: 20) {
			media(%s) {`+mediaFields+`}
		}
	}`, varDefs, mediaArgs)
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, vars, &result); err != nil {
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

func (c *graphqlClient) Browse(ctx context.Context, filter BrowseFilter, page, perPage int) ([]Media, error) {
	// Build dynamic GraphQL query with optional filter variables
	varDefs := "$page: Int, $perPage: Int"
	mediaArgs := "type: ANIME"
	vars := map[string]any{"page": page, "perPage": perPage}

	if len(filter.Genres) == 1 {
		varDefs += ", $genre: String"
		mediaArgs += ", genre: $genre"
		vars["genre"] = filter.Genres[0]
	} else if len(filter.Genres) > 1 {
		varDefs += ", $genres: [String]"
		mediaArgs += ", genre_in: $genres"
		vars["genres"] = filter.Genres
	} else if filter.Genre != "" {
		varDefs += ", $genre: String"
		mediaArgs += ", genre: $genre"
		vars["genre"] = filter.Genre
	}
	if filter.Year > 0 {
		varDefs += ", $seasonYear: Int"
		mediaArgs += ", seasonYear: $seasonYear"
		vars["seasonYear"] = filter.Year
	}
	if filter.Season != "" {
		varDefs += ", $season: MediaSeason"
		mediaArgs += ", season: $season"
		vars["season"] = filter.Season
	}
	if filter.MinScore > 0 {
		varDefs += ", $minScore: Int"
		mediaArgs += ", averageScore_greater: $minScore"
		vars["minScore"] = filter.MinScore
	}
	if filter.Status != "" {
		varDefs += ", $status: MediaStatus"
		mediaArgs += ", status: $status"
		vars["status"] = filter.Status
	}
	if filter.Format != "" {
		varDefs += ", $format: MediaFormat"
		mediaArgs += ", format: $format"
		vars["format"] = filter.Format
	}
	if filter.IsAdult {
		varDefs += ", $isAdult: Boolean"
		mediaArgs += ", isAdult: $isAdult"
		vars["isAdult"] = true
	}

	// Default sort
	sort := "POPULARITY_DESC"
	if filter.Sort != "" {
		sort = filter.Sort
	}
	mediaArgs += ", sort: " + sort

	q := fmt.Sprintf(`query (%s) {
		Page(page: $page, perPage: $perPage) {
			media(%s) {`+mediaFields+`}
		}
	}`, varDefs, mediaArgs)

	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, vars, &result); err != nil {
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

func (c *graphqlClient) GetAiringSchedule(ctx context.Context, from, to int64) ([]AiringSchedule, error) {
	var all []AiringSchedule
	for page := 1; page <= 3; page++ {
		q := `query ($from: Int, $to: Int, $page: Int) {
			Page(page: $page, perPage: 50) {
				airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
					airingAt episode
					media {` + mediaFields + `}
				}
			}
		}`
		var result struct {
			Page struct {
				AiringSchedules []AiringSchedule `json:"airingSchedules"`
			} `json:"Page"`
		}
		if err := c.query(ctx, q, map[string]any{"from": from, "to": to, "page": page}, &result); err != nil {
			if len(all) > 0 {
				break // return partial results
			}
			return nil, err
		}
		all = append(all, result.Page.AiringSchedules...)
		if len(result.Page.AiringSchedules) < 50 {
			break
		}
	}
	return all, nil
}

func (c *graphqlClient) GetMediaRelations(ctx context.Context, id int) (*Media, error) {
	q := `query ($id: Int) {
		Media(id: $id, type: ANIME) {` + mediaFields + `
			relations {
				edges {
					relationType
					node {` + mediaFields + `}
				}
			}
		}
	}`
	var result struct {
		Media Media `json:"Media"`
	}
	if err := c.query(ctx, q, map[string]any{"id": id}, &result); err != nil {
		return nil, err
	}
	return &result.Media, nil
}
