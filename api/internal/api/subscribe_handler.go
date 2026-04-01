package api

import (
	"fmt"
	"net/http"
	"net/url"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type subscribeRequest struct {
	// AnimeName is the display name for this subscription
	AnimeName string `json:"anime_name"`
	// Source determines which RSS feed to create: "mikan", "nyaa", "dmhy"
	Source string `json:"source"`
	// Query is the search term used to build the RSS URL and filter regex
	Query string `json:"query"`
	// MikanBangumiID is optional — if provided, creates a per-anime Mikan RSS feed
	MikanBangumiID string `json:"mikan_bangumi_id,omitempty"`
	// SubGroup filters downloads to a specific fansub group (optional)
	SubGroup string `json:"sub_group,omitempty"`
	// Resolution filters downloads to a specific quality (optional, e.g. "1080p")
	Resolution string `json:"resolution,omitempty"`
	// SaveDir is the download destination (optional)
	SaveDir string `json:"save_dir,omitempty"`
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

	// Build filter regex from query — escape special chars, make case-insensitive
	filterRegex := fmt.Sprintf("(?i)%s", regexEscape(req.Query))

	// Create download rule
	rule, err := h.queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
		ID:               uuid.NewString(),
		Name:             req.AnimeName,
		Enabled:          1,
		RssFeedID:        feed.ID,
		FilterRegex:      filterRegex,
		ExcludeRegex:     "",
		SaveDir:          req.SaveDir,
		EpisodeOffset:    0,
		ResolutionFilter: req.Resolution,
		SubgroupFilter:   req.SubGroup,
		MinSeeders:       0,
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
