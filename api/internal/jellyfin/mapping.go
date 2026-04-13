package jellyfin

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// EncodeItemID encodes a milmil type+id pair into a Jellyfin-compatible item ID.
// Format: base64url("type:id")
func EncodeItemID(typ, id string) string {
	return base64.URLEncoding.EncodeToString([]byte(typ + ":" + id))
}

// DecodeItemID decodes a Jellyfin item ID back into type and milmil id.
func DecodeItemID(encoded string) (typ, id string, err error) {
	b, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", fmt.Errorf("decode item id: %w", err)
	}
	parts := strings.SplitN(string(b), ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid item id format: missing colon separator")
	}
	return parts[0], parts[1], nil
}
