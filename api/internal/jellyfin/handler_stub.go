package jellyfin

import (
	"github.com/milmil/api/internal/jellyfin/imagecache"
	"github.com/milmil/api/internal/store"
)

// Handler holds dependencies for Jellyfin-compatible endpoints.
// This will be moved to router.go in Task 10.
type Handler struct {
	queries       *store.Queries
	jwtSecret     string
	serverID      string
	encryptionKey []byte
	imageCache    *imagecache.Cache
}
