package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/longbridgeapp/opencc"
	"github.com/milmil/api/internal/store"
)

var subscribeT2S, _ = opencc.New("t2s")

type subscribeRequest struct {
	AnimeName      string `json:"anime_name"`
	Source         string `json:"source"`
	Query          string `json:"query"`
	MikanBangumiID string `json:"mikan_bangumi_id,omitempty"`
	SubGroup       string `json:"sub_group,omitempty"`
	Resolution     string `json:"resolution,omitempty"`
	LibraryID      string `json:"library_id,omitempty"`
	BangumiID      int    `json:"bangumi_id,omitempty"`
}

type subscribeResponse struct {
	Feed *store.RssFeed     `json:"feed"`
	Rule *store.DownloadRule `json:"rule"`
}

func (h *handler) handleSubscribe(c echo.Context) error {
	var req subscribeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.AnimeName == "" || req.Query == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "anime_name and query are required")
	}
	if req.Source == "" {
		req.Source = "mikan"
	}

	ctx := c.Request().Context()

	// Build RSS feed URL based on source
	var feedURL string
	feedType := req.Source
	switch req.Source {
	case "mikan":
		if req.MikanBangumiID != "" {
			feedURL = fmt.Sprintf("https://mikanani.me/RSS/Bangumi?bangumiId=%s", req.MikanBangumiID)
		} else {
			feedURL = fmt.Sprintf("https://mikanani.me/RSS/Search?searchstr=%s", url.QueryEscape(req.Query))
		}
	case "nyaa":
		feedURL = fmt.Sprintf("https://nyaa.si/?page=rss&q=%s&c=1_0&f=0", url.QueryEscape(req.Query))
	case "dmhy":
		feedURL = fmt.Sprintf("https://share.dmhy.org/topics/rss/rss.xml?keyword=%s", url.QueryEscape(req.Query))
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported source: "+req.Source)
	}

	// Create RSS feed
	feed, err := h.queries.CreateRSSFeed(ctx, store.CreateRSSFeedParams{
		ID:                   uuid.NewString(),
		Name:                 fmt.Sprintf("[Auto] %s", req.AnimeName),
		Url:                  feedURL,
		Type:                 feedType,
		Enabled:              1,
		FetchIntervalMinutes: 30,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Build filter regex — split query into parts joined by .* for flexible matching,
	// and generate both traditional + simplified Chinese variants.
	parts := splitQueryParts(req.Query)
	pattern := joinRegexParts(parts)
	filterRegex := fmt.Sprintf("(?i)%s", pattern)
	if subscribeT2S != nil {
		simplified, _ := subscribeT2S.Convert(req.Query)
		if simplified != req.Query {
			simplifiedParts := splitQueryParts(simplified)
			simplifiedPattern := joinRegexParts(simplifiedParts)
			filterRegex = fmt.Sprintf("(?i)(%s|%s)", pattern, simplifiedPattern)
		}
	}

	// Resolve save directory from library path if library_id provided
	saveDir := ""
	if req.LibraryID != "" {
		lib, libErr := h.queries.GetLibrary(ctx, req.LibraryID)
		if libErr == nil {
			saveDir = lib.Path
		}
	}

	// Create download rule
	rule, err := h.queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
		ID:               uuid.NewString(),
		Name:             req.AnimeName,
		Enabled:          1,
		RssFeedID:        feed.ID,
		FilterRegex:      filterRegex,
		ExcludeRegex:     "",
		SaveDir:          saveDir,
		EpisodeOffset:    0,
		ResolutionFilter: req.Resolution,
		SubgroupFilter:   req.SubGroup,
		MinSeeders:       0,
		LibraryID:        sql.NullString{String: req.LibraryID, Valid: req.LibraryID != ""},
		BangumiID:        sql.NullInt64{Int64: int64(req.BangumiID), Valid: req.BangumiID != 0},
	})
	if err != nil {
		// Clean up feed if rule creation fails
		_ = h.queries.DeleteRSSFeed(ctx, feed.ID)
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusCreated, subscribeResponse{
		Feed: &feed,
		Rule: &rule,
	})
}

// splitQueryParts splits a query into meaningful parts for regex matching.
// e.g. "葬送的芙莉蓮 S2" → ["葬送的芙莉蓮", "S2"]
func splitQueryParts(query string) []string {
	var parts []string
	for _, p := range strings.Fields(query) {
		p = strings.TrimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

// joinRegexParts joins escaped query parts with .* for flexible matching.
// e.g. ["葬送的芙莉蓮", "S2"] → "葬送的芙莉蓮.*S2"
func joinRegexParts(parts []string) string {
	escaped := make([]string, len(parts))
	for i, p := range parts {
		escaped[i] = regexEscape(p)
	}
	return strings.Join(escaped, ".*")
}

// regexEscape escapes special regex characters in a string.
func regexEscape(s string) string {
	special := `\.+*?^$()[]{}|`
	result := make([]byte, 0, len(s)*2)
	for i := 0; i < len(s); i++ {
		for j := 0; j < len(special); j++ {
			if s[i] == special[j] {
				result = append(result, '\\')
				break
			}
		}
		result = append(result, s[i])
	}
	return string(result)
}
