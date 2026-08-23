package api

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v5"
	ws2 "github.com/milmil/api/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: checkWSOrigin,
}

// checkWSOrigin guards the handshake against cross-site WebSocket hijacking.
//
// Origin is only a second line of defence — handleWebSocket independently
// requires a ticket — but it still has to be correct, and it has to allow the
// deployments people actually run: the web UI is served from the same host as
// the API (directly or behind a reverse proxy), which may be a LAN address or
// a domain, not just localhost.
func checkWSOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients (CLI, mpv, curl) send no Origin. They are still
		// required to present a valid ticket.
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	// Same-origin — the normal production case.
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	// Dev: the Vite dev server runs on a different loopback port than the API.
	return isLoopbackHost(u.Hostname())
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// handleWSTicket issues a single-use ticket for the authenticated caller to
// open a WebSocket with. Runs behind authMiddleware.
func (h *handler) handleWSTicket(c *echo.Context) error {
	ticket, err := h.wsTickets.Issue(getUserID(c))
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{
		"ticket":     ticket,
		"expires_in": int(ws2.TicketTTL.Seconds()),
	})
}

func (h *handler) handleWebSocket(c *echo.Context) error {
	// The browser cannot attach an Authorization header to a handshake, so the
	// caller redeems a ticket obtained from GET /api/v1/ws/ticket instead.
	if _, ok := h.wsTickets.Redeem(c.QueryParam("ticket")); !ok {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired ticket")
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	client := ws2.NewClient(h.wsHub, conn)
	h.wsHub.Register(client)

	go client.WritePump()
	go client.ReadPump()

	return nil
}
