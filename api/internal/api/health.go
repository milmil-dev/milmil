package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/milmil/api/internal/version"
)

func handleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"version": version.Version,
	})
}
