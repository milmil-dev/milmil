package api

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v5"
	ws2 "github.com/milmil/api/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser clients (curl, etc.)
		}
		return strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "http://127.0.0.1")
	},
}

func (h *handler) handleWebSocket(c *echo.Context) error {
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
