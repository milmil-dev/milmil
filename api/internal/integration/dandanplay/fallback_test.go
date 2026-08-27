package dandanplay_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/dandanplay"
)

// TestFallbackClient_UsesOfficialWhenCredentialsAvailable verifies that the
// official server is called with X-AppId header when credentials are provided.
func TestFallbackClient_UsesOfficialWhenCredentialsAvailable(t *testing.T) {
	officialCalled := false
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		officialCalled = true
		if r.Header.Get("X-AppId") != "test-app-id" {
			t.Errorf("expected X-AppId header, got %q", r.Header.Get("X-AppId"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"count":2,"comments":[{"cid":1,"p":"1.0,1,16777215","m":"hello"},{"cid":2,"p":"2.0,1,16777215","m":"world"}]}`))
	}))
	defer official.Close()

	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("fallback should not be called when official succeeds")
	}))
	defer fallbackSrv.Close()

	c := dandanplay.NewFallbackClient(official.Client(), mockCredentials, official.URL, fallbackSrv.URL)
	comments, err := c.GetComments(context.Background(), 999)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !officialCalled {
		t.Error("expected official server to be called")
	}
	if len(comments) != 2 {
		t.Errorf("expected 2 comments, got %d", len(comments))
	}
}

// TestFallbackClient_FallsBackWhenNoCredentials verifies that the fallback
// server is used when the official client has no credentials, and that no
// auth headers are sent to the fallback.
func TestFallbackClient_FallsBackWhenNoCredentials(t *testing.T) {
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Official server should not receive a real request (client won't even
		// send one when credentials are empty), so if it does, respond 401.
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer official.Close()

	fallbackCalled := false
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalled = true
		// Fallback receives noopCredFn ("noop"/"noop"), not real user credentials.
		// Verify no real app-id was forwarded.
		if r.Header.Get("X-AppId") == "test-app-id" {
			t.Error("fallback should not receive real user credentials")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"count":1,"comments":[{"cid":10,"p":"5.0,1,255","m":"fallback comment"}]}`))
	}))
	defer fallbackSrv.Close()

	// Use a shared HTTP client that can reach both test servers.
	sharedClient := &http.Client{}

	c := dandanplay.NewFallbackClient(sharedClient, emptyCredentials, official.URL, fallbackSrv.URL)
	comments, err := c.GetComments(context.Background(), 42)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !fallbackCalled {
		t.Error("expected fallback server to be called")
	}
	if len(comments) != 1 || comments[0].M != "fallback comment" {
		t.Errorf("unexpected comments: %v", comments)
	}
}

// TestFallbackClient_NeverFallsBackOn429 verifies that a rate limit from the
// official network is returned as-is: routing around a quota would be
// circumventing 弹弹play's limit policy.
func TestFallbackClient_NeverFallsBackOn429(t *testing.T) {
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer official.Close()

	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("fallback must not be called on 429")
	}))
	defer fallbackSrv.Close()

	c := dandanplay.NewFallbackClient(&http.Client{}, mockCredentials, official.URL, fallbackSrv.URL)
	_, err := c.GetComments(context.Background(), 77)
	if !errors.Is(err, dandanplay.ErrRateLimited) {
		t.Fatalf("want ErrRateLimited, got %v", err)
	}
}

// TestFallbackClient_OffWithoutURL verifies that no fallback exists unless a
// proxy URL is configured: with empty credentials the call fails instead of
// silently reaching a third-party mirror.
func TestFallbackClient_OffWithoutURL(t *testing.T) {
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("official must not be reached without credentials")
	}))
	defer official.Close()

	c := dandanplay.NewFallbackClient(&http.Client{}, emptyCredentials, official.URL, "")
	_, err := c.GetComments(context.Background(), 1)
	if !errors.Is(err, dandanplay.ErrNoCredentials) {
		t.Fatalf("want ErrNoCredentials, got %v", err)
	}
}
