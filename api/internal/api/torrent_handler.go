package api

import (
	"database/sql"
	"net/http"
	"sort"

	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/torrent"
)

func (h *handler) handleTorrentSearch(c *echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q required")
	}

	source := c.QueryParam("source")
	ctx := c.Request().Context()

	var results []torrent.SearchResult
	if source == "" || source == "all" {
		results = h.torrentRegistry.SearchAll(ctx, q)
	} else {
		var err error
		results, err = h.torrentRegistry.Search(ctx, source, q)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, "search failed: "+err.Error())
		}
	}

	// Sort by publish date descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].PublishDate.After(results[j].PublishDate)
	})

	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleTorrentProviders(c *echo.Context) error {
	return c.JSON(http.StatusOK, h.torrentRegistry.Names())
}

type addTorrentRequest struct {
	URL  string `json:"url"`
	Name string `json:"name"`
}

func (h *handler) handleTorrentSearchAdd(c *echo.Context) error {
	var req addTorrentRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url is required")
	}

	gid, err := h.downloader.Add(c.Request().Context(), req.URL, downloader.AddOptions{Name: req.Name})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "download error: "+err.Error())
	}

	name := req.Name
	if name == "" {
		name = req.URL
	}

	dl, err := h.queries.CreateDownload(c.Request().Context(), store.CreateDownloadParams{
		ID:      uuid.New().String(),
		Gid:     gid,
		Url:     req.URL,
		Name:    name,
		Status:  "active",
		SaveDir: "",
		RuleID:  sql.NullString{},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, dl)
}
