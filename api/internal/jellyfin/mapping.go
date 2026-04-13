package jellyfin

import (
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/labstack/echo/v4"
)

// EncodeItemID encodes a milmil type+id pair into a Jellyfin-compatible item ID.
// Format: hex("type:id") — produces a string of hex characters that looks like a GUID to clients.
func EncodeItemID(typ, id string) string {
	return hex.EncodeToString([]byte(typ + ":" + id))
}

// DecodeItemID decodes a Jellyfin item ID back into type and milmil id.
func DecodeItemID(encoded string) (typ, id string, err error) {
	b, err := hex.DecodeString(encoded)
	if err != nil {
		return "", "", fmt.Errorf("decode item id: %w", err)
	}
	parts := strings.SplitN(string(b), ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid item id format: missing colon separator")
	}
	return parts[0], parts[1], nil
}

// queryParam reads a query parameter case-insensitively (tries lowercase first, then PascalCase).
func queryParam(c echo.Context, key string) string {
	if v := c.QueryParam(key); v != "" {
		return v
	}
	// Try PascalCase
	pascal := strings.ToUpper(key[:1]) + key[1:]
	return c.QueryParam(pascal)
}
