package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type searchAnimeItem struct {
	ID        string   `json:"id"`
	BangumiID *int64   `json:"bangumi_id,omitempty"`
	AnilistID *int64   `json:"anilist_id,omitempty"`
	Title     string   `json:"title"`
	AltTitles []string `json:"alt_titles"`
	Score     float64  `json:"score"`
	Source    string   `json:"source"`
}

// handleSearchAnime returns local-database anime matches for a fuzzy query.
//
// Query params:
//   - q:     required substring to match against title/title_zh/title_en
//   - limit: optional, 1..100 (default 20)
func (h *handler) handleSearchAnime(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing q")
	}
	limit := int64(20)
	if l, err := strconv.ParseInt(c.QueryParam("limit"), 10, 64); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	rows, err := h.queries.SearchAnimeLocal(c.Request().Context(), store.SearchAnimeLocalParams{
		Pattern: "%" + q + "%",
		LimitN:  limit,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	items := make([]searchAnimeItem, 0, len(rows))
	for _, a := range rows {
		items = append(items, animeToSearchItem(a, q))
	}
	return c.JSON(http.StatusOK, map[string]any{"items": items})
}

func animeToSearchItem(a store.Anime, query string) searchAnimeItem {
	alts := make([]string, 0, 2)
	if a.TitleZh.Valid && a.TitleZh.String != "" {
		alts = append(alts, a.TitleZh.String)
	}
	if a.TitleEn.Valid && a.TitleEn.String != "" {
		alts = append(alts, a.TitleEn.String)
	}
	item := searchAnimeItem{
		ID:        a.ID,
		Title:     a.Title,
		AltTitles: alts,
		Score:     scoreTitleMatch(query, append([]string{a.Title}, alts...)),
		Source:    "local",
	}
	if a.BangumiID.Valid {
		v := a.BangumiID.Int64
		item.BangumiID = &v
	}
	if a.AnilistID.Valid {
		v := a.AnilistID.Int64
		item.AnilistID = &v
	}
	return item
}

// scoreTitleMatch returns the best 0..1 match score across candidate titles.
// Exact match: 1.0; prefix: 0.9; whole-word substring: 0.75; substring: 0.6.
func scoreTitleMatch(query string, candidates []string) float64 {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return 0
	}
	best := 0.0
	for _, raw := range candidates {
		c := strings.ToLower(raw)
		switch {
		case c == q && best < 1.0:
			best = 1.0
		case strings.HasPrefix(c, q) && best < 0.9:
			best = 0.9
		case containsWord(c, q) && best < 0.75:
			best = 0.75
		case strings.Contains(c, q) && best < 0.6:
			best = 0.6
		}
	}
	return best
}

func containsWord(haystack, needle string) bool {
	for _, sep := range []string{" ", "-", "_", ":"} {
		for _, part := range strings.Split(haystack, sep) {
			if part == needle {
				return true
			}
		}
	}
	return false
}
