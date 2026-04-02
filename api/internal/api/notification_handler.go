package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

func (h *handler) handleListNotifications(c echo.Context) error {
	limit, _ := strconv.ParseInt(c.QueryParam("limit"), 10, 64)
	if limit <= 0 {
		limit = 20
	}
	offset, _ := strconv.ParseInt(c.QueryParam("offset"), 10, 64)
	if offset < 0 {
		offset = 0
	}
	filter := c.QueryParam("filter")

	notifications, err := h.notifier.List(c.Request().Context(), limit, offset, filter)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, notifications)
}

func (h *handler) handleUnreadCount(c echo.Context) error {
	count, err := h.notifier.UnreadCount(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]int64{"count": count})
}

func (h *handler) handleMarkNotificationRead(c echo.Context) error {
	id := c.Param("id")
	if id == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "id is required")
	}
	if err := h.notifier.MarkRead(c.Request().Context(), id); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handler) handleMarkAllRead(c echo.Context) error {
	if err := h.notifier.MarkAllRead(c.Request().Context()); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handler) handleClearNotifications(c echo.Context) error {
	if err := h.notifier.Clear(c.Request().Context()); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
