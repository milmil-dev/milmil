package sync

import (
	"context"
	"time"
)

// TokenStore reads and writes provider OAuth tokens for sync users.
// Implementations must be safe for concurrent use.
type TokenStore interface {
	Get(ctx context.Context, userID string, p ProviderName) (access, refresh string, err error)
	Put(ctx context.Context, userID string, p ProviderName, access, refresh string, expiresAt time.Time) error
	LoadCreds(ctx context.Context, p ProviderName) (OAuthCreds, error)
}
