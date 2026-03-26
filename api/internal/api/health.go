package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func handleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"version": "1.0.0",
	})
}
