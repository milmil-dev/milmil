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
}

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
