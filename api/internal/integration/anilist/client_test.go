package anilist_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/anilist"
)

func TestSearchMedia_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"Page":{"media":[{"id":154587,"title":{"romaji":"Sousou no Frieren","english":"Frieren: Beyond Journey's End","native":"葬送のフリーレン"},"coverImage":{"extraLarge":"https://img.jpg","large":"https://img-s.jpg"},"bannerImage":"https://banner.jpg","popularity":200000,"averageScore":92,"episodes":28,"status":"FINISHED","season":"FALL","seasonYear":2023,"format":"TV"}]}}}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	media, err := c.SearchMedia(context.Background(), "Frieren")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(media) != 1 {
		t.Fatalf("want 1 media, got %d", len(media))
	}
	if media[0].Title.English != "Frieren: Beyond Journey's End" {
		t.Errorf("want English title, got %s", media[0].Title.English)
	}
}

func TestGetTrending_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"Page":{"media":[{"id":1,"title":{"romaji":"Test"},"coverImage":{"extraLarge":"https://img.jpg"},"popularity":100,"episodes":12,"status":"RELEASING","format":"TV"}]}}}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	media, err := c.GetTrending(context.Background(), 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(media) != 1 {
		t.Fatalf("want 1 media, got %d", len(media))
	}
}

func TestGetMedia_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	_, err := c.GetMedia(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestSearchMedia_GraphQLError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":null,"errors":[{"message":"validation error"}]}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	_, err := c.SearchMedia(context.Background(), "test")
	if err == nil {
		t.Fatal("expected error for GraphQL error response")
	}
}
