package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *handler) handleAria2Status(c echo.Context) error {
	ctx := c.Request().Context()

	version, err := h.aria2.GetVersion(ctx)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"connected": false,
			"rpc_url":   h.aria2.RPCURL(),
			"error":     err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"connected": true,
		"version":   version,
		"rpc_url":   h.aria2.RPCURL(),
	})
}
