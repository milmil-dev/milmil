package jellyfin

import (
	"crypto/md5"
	"fmt"
	"strings"
	"sync"

	"github.com/labstack/echo/v4"
)

// idMap stores bidirectional mapping between 32-char GUID-like IDs and type:id pairs.
var idMap = struct {
	sync.RWMutex
	toRaw  map[string]string // guid -> "type:id"
	toGUID map[string]string // "type:id" -> guid
}{
	toRaw:  make(map[string]string),
	toGUID: make(map[string]string),
}

// EncodeItemID encodes a milmil type+id pair into a 32-char hex string (GUID format).
// Uses MD5 hash for deterministic, fixed-length output. Stores mapping for reverse lookup.
func EncodeItemID(typ, id string) string {
	raw := typ + ":" + id

	idMap.RLock()
	if guid, ok := idMap.toGUID[raw]; ok {
		idMap.RUnlock()
		return guid
	}
	idMap.RUnlock()

	hash := md5.Sum([]byte(raw))
	guid := fmt.Sprintf("%x", hash) // 32 hex chars

	idMap.Lock()
	idMap.toRaw[guid] = raw
	idMap.toGUID[raw] = guid
	idMap.Unlock()

	return guid
}

// DecodeItemID decodes a 32-char GUID back into type and milmil id.
func DecodeItemID(encoded string) (typ, id string, err error) {
	idMap.RLock()
	raw, ok := idMap.toRaw[encoded]
	idMap.RUnlock()

	if !ok {
		return "", "", fmt.Errorf("unknown item id: %s", encoded)
	}

	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid item id format")
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
