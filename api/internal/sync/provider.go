package sync

import (
	"context"
	"errors"
	"time"
)

// Provider is the tracker-facing seam. Concrete implementations live in
// sub-packages and are wired into the worker at startup.
type Provider interface {
	Name() ProviderName
	// Push dispatches a single outbox op against the tracker. Return a
	// *TransientError to signal the worker to retry; any other error is
	// treated as fatal and the op will be marked failed.
	Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error
	// FetchList pulls the user's full remote collection for one-shot import.
	FetchList(ctx context.Context, tok string) ([]RemoteEntry, error)
	// RefreshToken exchanges a refresh token for a new access token (and
	// possibly a new refresh token). Providers should return an error
	// wrapping ErrNeedsReauth when the refresh token itself is invalid.
	RefreshToken(ctx context.Context, creds OAuthCreds, refreshToken string) (RefreshedToken, error)
}

// OAuthCreds is the configured client id/secret for a provider.
type OAuthCreds struct {
	ClientID     string
	ClientSecret string
}

// RefreshedToken is the response from Provider.RefreshToken. An empty
// RefreshToken means the caller keeps its previous one.
type RefreshedToken struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    time.Duration
}

// ErrNeedsReauth is returned by providers on 401/403 and by the worker when a
// refresh attempt itself fails. Callers use errors.Is to detect it.
var ErrNeedsReauth = errors.New("sync: needs reauth")

// ExternalIDs carries every provider-native identifier we know for a given
// anime. Providers pick whichever one they need.
type ExternalIDs struct {
	AniDB             int64
	AniList           int64
	Bangumi           int64
	MAL               int64
	TMDB              int64
	BangumiEpisodeIDs []int64
}

// RemoteEntry is a single row from a provider's remote collection.
type RemoteEntry struct {
	ProviderAnimeID int64
	Status          WatchStatus
	Progress        int
	UpdatedAt       time.Time
}

// TransientError wraps retryable provider failures. RetryAfter is advisory;
// the worker may clamp it against its own backoff schedule.
type TransientError struct {
	Err        error
	RetryAfter time.Duration
}

func (e *TransientError) Error() string { return e.Err.Error() }
func (e *TransientError) Unwrap() error { return e.Err }

// IsTransient reports whether err (or any wrapped error) is a *TransientError.
func IsTransient(err error) (*TransientError, bool) {
	var t *TransientError
	if errors.As(err, &t) {
		return t, true
	}
	return nil, false
}
