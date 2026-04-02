package api

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
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

	// Collect all unique title variants for multi-language search.
	titleSet := make(map[string]bool)
	var titles []string
	for _, t := range []string{detail.Title, detail.TitleOriginal, detail.TitleEN} {
		t = strings.TrimSpace(t)
		if t != "" && !titleSet[t] {
			titleSet[t] = true
			titles = append(titles, t)
		}
	}
	if len(titles) == 0 {
		return c.JSON(http.StatusOK, map[string]any{"results": []any{}})
	}

	// All registered provider names.
	allSources := h.torrentRegistry.Names()

	// Determine which sources to query.
	type sourceQuery struct {
		name  string
		query string
	}
	var queries []sourceQuery

	if source == "" || source == "all" {
		// Search every source with every title variant.
		for _, src := range allSources {
			for _, t := range titles {
				queries = append(queries, sourceQuery{name: src, query: t})
			}
		}
	} else {
		// Single source — still search with all title variants.
		for _, t := range titles {
			queries = append(queries, sourceQuery{name: source, query: t})
		}
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
			slog.Debug("anime torrents: searching", "source", name, "query", query)
			res, err := h.torrentRegistry.Search(ctx, name, query)
			if err != nil {
				slog.Warn("anime torrents: search failed", "source", name, "error", err)
				return
			}
			if len(res) == 0 {
				slog.Debug("anime torrents: no results", "source", name)
				return
			}
			slog.Debug("anime torrents: found results", "source", name, "count", len(res))
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
