package dandanplay_test

import (
	"context"
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

// TestFallbackClient_FallsBackOn429 verifies that when the official server
// returns HTTP 429 (rate limited), the fallback server is tried instead.
func TestFallbackClient_FallsBackOn429(t *testing.T) {
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer official.Close()

	fallbackCalled := false
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalled = true
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"count":1,"comments":[{"cid":99,"p":"3.0,1,16711680","m":"rate limit fallback"}]}`))
	}))
	defer fallbackSrv.Close()

	// Both servers are independent httptest servers; use a plain http.Client.
	sharedClient := &http.Client{}

	c := dandanplay.NewFallbackClient(sharedClient, mockCredentials, official.URL, fallbackSrv.URL)
	comments, err := c.GetComments(context.Background(), 77)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !fallbackCalled {
		t.Error("expected fallback server to be called after 429")
	}
	if len(comments) != 1 || comments[0].M != "rate limit fallback" {
		t.Errorf("unexpected comments: %v", comments)
	}
}
