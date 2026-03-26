package dandanplay_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/dandanplay"
)

func mockCredentials(_ context.Context) (string, string, error) {
	return "test-app-id", "test-secret", nil
}

func emptyCredentials(_ context.Context) (string, string, error) {
	return "", "", nil
}

func TestMatchFile_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/match" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("X-AppId") != "test-app-id" {
			t.Fatalf("missing X-AppId header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errorCode":0,"isMatched":true,"matches":[{"episodeId":12345,"animeId":100,"animeTitle":"Test Anime","episodeTitle":"Episode 1"}]}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	result, err := c.MatchFile(context.Background(), "test.mkv", "abc123hash", 1000000, 1440)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsMatched {
		t.Error("want matched=true")
	}
	if len(result.Matches) != 1 || result.Matches[0].EpisodeID != 12345 {
		t.Errorf("want episodeId=12345, got %v", result.Matches)
	}
}

func TestMatchFile_NoCredentials(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not reach server with no credentials")
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), emptyCredentials, srv.URL)
	_, err := c.MatchFile(context.Background(), "test.mkv", "abc", 100, 0)
	if err == nil {
		t.Fatal("expected error for missing credentials")
	}
}

func TestGetComments_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/comment/12345" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"count":1,"comments":[{"cid":1,"p":"12.5,1,16777215","m":"test danmaku"}]}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	comments, err := c.GetComments(context.Background(), 12345)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 1 || comments[0].M != "test danmaku" {
		t.Errorf("unexpected comments: %v", comments)
	}
}

func TestGetComments_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	_, err := c.GetComments(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestMatchFile_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errorCode":1,"errorMessage":"invalid hash"}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	_, err := c.MatchFile(context.Background(), "test.mkv", "bad", 100, 0)
	if err == nil {
		t.Fatal("expected error for API error response")
	}
}
