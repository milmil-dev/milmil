package api

import (
	"errors"
	"testing"

	"github.com/milmil/api/internal/integration/tmdb"
)

func TestTMDBTestErrorMessage_MapsKnownErrors(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"unauthorized", tmdb.ErrUnauthorized, "invalid credentials"},
		{"rate limited", tmdb.ErrRateLimited, "rate limited by TMDB, try again shortly"},
		{"unavailable", tmdb.ErrUnavailable, "could not reach TMDB"},
		{"unexpected", errors.New("something else"), "unexpected error contacting TMDB"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tmdbTestErrorMessage(tc.err)
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestTMDBTestErrorMessage_DoesNotLeakWrappedDetail(t *testing.T) {
	// A wrapped error from the TMDB client may carry a sanitized URL plus
	// transport details. Even so, our user-facing message must be one of the
	// fixed strings — never raw err.Error() output.
	wrapped := errors.New(`Get "https://api.themoviedb.org/3/authentication?[redacted]": dial tcp: connection refused`)
	got := tmdbTestErrorMessage(wrapped)
	if got != "unexpected error contacting TMDB" {
		t.Errorf("expected fixed fallback message, got %q", got)
	}
}
