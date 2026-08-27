package jellyfin

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v5"
)

// handleUserImage serves the user's avatar (the 512² JPEG the main API
// rendered) so Infuse / Apple TV show the same picture as the web and Mac
// apps. `?tag=` is accepted and ignored: the tag only busts client caches.
func (h *Handler) handleUserImage(c *echo.Context) error {
	// Clients send the id exactly as the user DTO gave it; accept the raw
	// user id and the encoded item-id form alike.
	userID := c.Param("userId")
	if _, decoded, err := DecodeItemID(userID); err == nil && decoded != "" {
		userID = decoded
	}
	if userID == "" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "User not found"})
	}
	user, err := h.queries.GetUserByID(c.Request().Context(), userID)
	if err != nil || !user.AvatarPath.Valid || h.avatarDir == "" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}
	path := filepath.Join(h.avatarDir, user.ID+"-512.jpg")
	f, err := os.Open(path)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Image unreadable"})
	}
	c.Response().Header().Set("Content-Type", "image/jpeg")
	c.Response().Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(c.Response(), c.Request(), "avatar.jpg", stat.ModTime(), f)
	return nil
}
