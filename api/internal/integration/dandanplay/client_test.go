package dandanplay_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestMatchFiles_BatchesAndKeysByHash(t *testing.T) {
	var batches [][]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/match/batch" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		var body struct {
			Requests []struct {
				FileHash string `json:"fileHash"`
				FileName string `json:"fileName"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		hashes := make([]string, 0, len(body.Requests))
		for _, req := range body.Requests {
			hashes = append(hashes, req.FileHash)
		}
		batches = append(batches, hashes)
		w.Header().Set("Content-Type", "application/json")
		// Only the first file of each batch matches.
		fmt.Fprintf(w, `{"errorCode":0,"success":true,"results":[{"success":true,"fileHash":%q,"matchResult":{"episodeId":7,"animeId":3}},{"success":false,"fileHash":"x"}]}`, hashes[0])
	}))
	defer srv.Close()

	reqs := make([]dandanplay.MatchRequest, 0, dandanplay.BatchMatchLimit+1)
	for i := range dandanplay.BatchMatchLimit + 1 {
		reqs = append(reqs, dandanplay.MatchRequest{FileName: "ep", FileHash: fmt.Sprintf("HASH%02d", i), FileSize: 1})
	}
	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	matches, err := c.MatchFiles(context.Background(), reqs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(batches) != 2 || len(batches[0]) != dandanplay.BatchMatchLimit || len(batches[1]) != 1 {
		t.Fatalf("want 32+1 split, got %v", batches)
	}
	if len(matches) != 2 || matches["hash00"].EpisodeID != 7 || matches["hash32"].EpisodeID != 7 {
		t.Errorf("want lower-cased hash keys for the two matched files, got %v", matches)
	}
}

func TestPostComment_UsesAppEndpointAndSurfacesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/comment/12345/app" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body["userName"] != "alice" {
			t.Errorf("want userName forwarded, got %v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errorCode":403,"success":false,"errorMessage":"quota exhausted"}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	err := c.PostComment(context.Background(), 12345, dandanplay.PostCommentReq{Time: 1, Mode: 1, Color: 16777215, Comment: "hi", UserName: "alice"})
	if !errors.Is(err, dandanplay.ErrAPIError) {
		t.Fatalf("want ErrAPIError, got %v", err)
	}
	if !strings.Contains(err.Error(), "quota exhausted") {
		t.Errorf("want upstream message surfaced, got %v", err)
	}
}
