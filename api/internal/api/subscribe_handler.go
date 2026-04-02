package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

// subscribeT2SMap — same map as bangumi client for Traditional→Simplified conversion.
var subscribeT2SMap = map[rune]rune{
	'龍': '龙', '戀': '恋', '愛': '爱', '後': '后', '宮': '宫', '戰': '战', '鬥': '斗',
	'險': '险', '懸': '悬', '機': '机', '運': '运', '動': '动', '異': '异', '轉': '转',
	'歷': '历', '軍': '军', '劇': '剧', '會': '会', '賽': '赛', '釣': '钓', '營': '营',
	'聲': '声', '優': '优', '續': '续', '場': '场', '書': '书', '說': '说', '輕': '轻',
	'遊': '游', '戲': '戏', '編': '编', '畫': '画', '創': '创', '癒': '愈', '淚': '泪',
	'鬱': '郁', '勵': '励', '誌': '志', '蓮': '莲', '園': '园', '職': '职', '樂': '乐',
	'體': '体', '開': '开', '門': '门', '間': '间', '車': '车', '東': '东', '飄': '飘',
	'熱': '热', '華': '华', '國': '国', '島': '岛', '來': '来', '與': '与', '為': '为',
	'從': '从', '們': '们', '個': '个', '這': '这', '裡': '里', '點': '点', '長': '长',
}

func subscribeConvertT2S(s string) string {
	out := make([]rune, 0, utf8.RuneCountInString(s))
	for _, r := range s {
		if mapped, ok := subscribeT2SMap[r]; ok {
			out = append(out, mapped)
		} else {
			out = append(out, r)
		}
	}
	return string(out)
}

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
	if req.AnimeName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "anime_name is required")
	}
	if req.Source == "" {
		req.Source = "mikan"
	}

	ctx := c.Request().Context()

	// If bangumi_id is provided, resolve titles for better RSS matching
	if req.BangumiID != 0 && req.Query == "" {
		detail, err := h.metadata.GetAnimeDetail(ctx, req.BangumiID)
		if err == nil {
			switch req.Source {
			case "mikan", "dmhy":
				req.Query = detail.Title // Chinese title
				if req.Query == "" {
					req.Query = detail.TitleOriginal
				}
			case "nyaa":
				req.Query = detail.TitleEN // English title
				if req.Query == "" {
					req.Query = detail.TitleOriginal
				}
			default:
				req.Query = detail.TitleOriginal
			}
		}
	}

	// Fallback to anime_name if query still empty
	if req.Query == "" {
		req.Query = req.AnimeName
	}

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
	{
		simplified := subscribeConvertT2S(req.Query)
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
