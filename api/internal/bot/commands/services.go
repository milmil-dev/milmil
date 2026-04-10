package commands

import (
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/store"
)

// Services holds shared dependencies for all command handlers.
type Services struct {
	Queries    *store.Queries
	Metadata   *metadata.Service
	Downloader downloader.Manager
}
