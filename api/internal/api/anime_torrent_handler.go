package api

import (
	"net/http"
	"strconv"
	"sync"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/torrent"
)

func (h *handler) handleAnimeTorrents(c echo.Context) error {
	idStr := c.Param("id")
	bangumiID, err := strconv.Atoi(idStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumi id")
	}

	source := c.QueryParam("source")
	ctx := c.Request().Context()

	// Fetch anime detail to get title variants for searching.
	detail, err := h.metadata.GetAnimeDetail(ctx, bangumiID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to fetch anime detail: "+err.Error())
	}

	// Build per-source search queries using the best title variant.
	// Mikan/DMHY: Chinese title preferred, fallback Japanese.
	// Nyaa: English title preferred, fallback Japanese.
	// DanDanPlay: Japanese title preferred, fallback Chinese.
	chineseOrJP := detail.Title
	if chineseOrJP == "" {
		chineseOrJP = detail.TitleOriginal
	}
	jpOrChinese := detail.TitleOriginal
	if jpOrChinese == "" {
		jpOrChinese = detail.Title
	}
	englishOrJP := detail.TitleEN
	if englishOrJP == "" {
		englishOrJP = detail.TitleOriginal
	}

	titleForSource := map[string]string{
		"mikan":      chineseOrJP,
		"dmhy":       chineseOrJP,
		"nyaa":       englishOrJP,
		"dandanplay":  jpOrChinese,
		"bangumi.moe": chineseOrJP,
		"acg.rip":     chineseOrJP,
	}

	// Determine which sources to query.
	type sourceQuery struct {
		name  string
		query string
	}
	var queries []sourceQuery

	if source == "" || source == "all" {
		for name, q := range titleForSource {
			if q != "" {
				queries = append(queries, sourceQuery{name: name, query: q})
			}
		}
	} else {
		q, ok := titleForSource[source]
		if !ok {
			// Unknown source — try with Chinese/JP title as fallback.
			q = chineseOrJP
		}
		if q == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "no usable title for search")
		}
		queries = append(queries, sourceQuery{name: source, query: q})
	}

	// Search all selected sources concurrently.
	var (
		mu      sync.Mutex
		results []torrent.SearchResult
		wg      sync.WaitGroup
	)
	for _, sq := range queries {
		wg.Add(1)
		go func(name, query string) {
			defer wg.Done()
			res, err := h.torrentRegistry.Search(ctx, name, query)
			if err != nil || len(res) == 0 {
				return
			}
			mu.Lock()
			results = append(results, res...)
			mu.Unlock()
		}(sq.name, sq.query)
	}
	wg.Wait()

	// Deduplicate by info_hash (skip entries with empty hash).
	seen := make(map[string]struct{})
	deduped := make([]torrent.SearchResult, 0, len(results))
	for _, r := range results {
		if r.InfoHash != "" {
			if _, dup := seen[r.InfoHash]; dup {
				continue
			}
			seen[r.InfoHash] = struct{}{}
		}
		deduped = append(deduped, r)
	}

	// Sort by publish date descending.
	torrent.SortByDate(deduped)

	return c.JSON(http.StatusOK, map[string]any{
		"results": deduped,
	})
}
