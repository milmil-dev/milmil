package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleTorrentSearch(c echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q required")
	}

	feedURL := fmt.Sprintf("https://nyaa.si/?page=rss&q=%s&c=1_2&f=0", url.QueryEscape(q))
	items, err := rss.ParseFeed(c.Request().Context(), feedURL)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "search failed")
	}

	return c.JSON(http.StatusOK, items)
}

type addTorrentRequest struct {
	URL  string `json:"url"`
	Name string `json:"name"`
}

func (h *handler) handleTorrentSearchAdd(c echo.Context) error {
	var req addTorrentRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url is required")
	}

	gid, err := h.aria2.AddURI(c.Request().Context(), []string{req.URL}, map[string]string{})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "aria2 error: "+err.Error())
	}

	name := req.Name
	if name == "" {
		name = req.URL
	}

	dl, err := h.queries.CreateDownload(c.Request().Context(), store.CreateDownloadParams{
		ID:      uuid.NewString(),
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
