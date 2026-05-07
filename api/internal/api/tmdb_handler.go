package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/tmdb"
)

type tmdbTestRequest struct {
	APIKey      string `json:"api_key"`
	AccessToken string `json:"access_token"`
}

type tmdbTestResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// handleTestTMDBConnection probes TMDB with the supplied credentials and
// returns whether they're valid. Credentials are used in-memory only —
// they're not persisted by this endpoint and the response never echoes them.
func (h *handler) handleTestTMDBConnection(c echo.Context) error {
	var req tmdbTestRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	auth := tmdb.Auth{
		APIKey:      strings.TrimSpace(req.APIKey),
		AccessToken: strings.TrimSpace(req.AccessToken),
	}
	if auth.APIKey == "" && auth.AccessToken == "" {
		return c.JSON(http.StatusOK, tmdbTestResponse{
			OK:    false,
			Error: "provide an API key or access token",
		})
	}

	client := tmdb.NewClientWithAuth(&http.Client{Timeout: 10 * time.Second}, auth)
	if err := client.Ping(c.Request().Context()); err != nil {
		return c.JSON(http.StatusOK, tmdbTestResponse{
			OK:    false,
			Error: tmdbTestErrorMessage(err),
		})
	}

	return c.JSON(http.StatusOK, tmdbTestResponse{OK: true})
}

// tmdbTestErrorMessage maps tmdb client errors to user-facing messages
// without leaking transport details that may include the URL.
func tmdbTestErrorMessage(err error) string {
	switch {
	case errors.Is(err, tmdb.ErrUnauthorized):
		return "invalid credentials"
	case errors.Is(err, tmdb.ErrRateLimited):
		return "rate limited by TMDB, try again shortly"
	case errors.Is(err, tmdb.ErrUnavailable):
		return "could not reach TMDB"
	default:
		return "unexpected error contacting TMDB"
	}
}
