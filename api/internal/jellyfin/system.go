package jellyfin

import (
	"net/http"
	"runtime"

	"github.com/labstack/echo/v4"
)

const serverVersion = "10.8.0"

func (h *Handler) handleSystemInfoPublic(c echo.Context) error {
	return c.JSON(http.StatusOK, ServerInfo{
		LocalAddress:           h.baseURL(c),
		ServerName:             "milmil",
		Version:                serverVersion,
		ID:                     h.serverID,
		ProductName:            "milmil",
		OperatingSystem:        runtime.GOOS,
		StartupWizardCompleted: true,
	})
}

func (h *Handler) handleSystemInfo(c echo.Context) error {
	return c.JSON(http.StatusOK, ServerInfo{
		LocalAddress:           h.baseURL(c),
		ServerName:             "milmil",
		Version:                serverVersion,
		ID:                     h.serverID,
		ProductName:            "milmil",
		OperatingSystem:        runtime.GOOS,
		StartupWizardCompleted: true,
		SupportsLibraryMonitor: true,
	})
}

func (h *Handler) handlePing(c echo.Context) error {
	return c.String(http.StatusOK, "\"milmil\"")
}

func (h *Handler) baseURL(c echo.Context) string {
	scheme := "http"
	if c.Request().TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + c.Request().Host
}
