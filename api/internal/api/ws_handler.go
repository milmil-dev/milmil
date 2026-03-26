package api

import (
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	ws2 "github.com/milmil/api/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *handler) handleWebSocket(c echo.Context) error {
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
