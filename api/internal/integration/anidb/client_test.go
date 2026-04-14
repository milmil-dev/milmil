package anidb

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newClientForTest(srv *httptest.Server) Client {
	return NewClient(srv.Client(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
}

// newNoCompressionClient returns an *http.Client with transparent gzip
// decompression disabled, so Content-Encoding: gzip responses reach our code
// unchanged. Required for tests that assert gzip-signaling behavior.
func newNoCompressionClient() *http.Client {
	return &http.Client{Transport: &http.Transport{DisableCompression: true}}
}

func TestClientDownloadManamiPlain(t *testing.T) {
	body := `{"data":[]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, body)
	}))
	defer srv.Close()

	c := newClientForTest(srv)
	got, err := c.DownloadManami(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != body {
		t.Errorf("got %q want %q", got, body)
	}
}

func TestClientDownloadAnimeListsPlain(t *testing.T) {
	body := `<anime-list></anime-list>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, body)
	}))
	defer srv.Close()

	c := newClientForTest(srv)
	got, err := c.DownloadAnimeLists(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != body {
		t.Errorf("got %q want %q", got, body)
	}
}

func TestClientDownloadTitlesGzipByURL(t *testing.T) {
	payload := `<animetitles></animetitles>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// No Content-Encoding header — gzip detection should kick in via .gz URL suffix.
		gw := gzip.NewWriter(w)
		_, _ = io.WriteString(gw, payload)
		_ = gw.Close()
	}))
	defer srv.Close()

	c := newClientForTest(srv)
	got, err := c.DownloadTitles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(got), "animetitles") {
		t.Errorf("expected gunzipped payload, got %q", got)
	}
}

func TestClientGzipByContentEncoding(t *testing.T) {
	payload := `{"data":[]}`
	// Use a URL that does NOT end in .gz; signal gzip via Content-Encoding only.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		gw := gzip.NewWriter(w)
		_, _ = io.WriteString(gw, payload)
		_ = gw.Close()
	}))
	defer srv.Close()

	// Override only the manami URL (which doesn't end in .gz). Use a no-compression
	// transport so Go's RoundTripper doesn't transparently gunzip and strip the header.
	c := NewClient(newNoCompressionClient(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	got, err := c.DownloadManami(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != payload {
		t.Errorf("got %q want %q", got, payload)
	}
}

func TestClientReturnsErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := newClientForTest(srv)
	if _, err := c.DownloadManami(context.Background()); err == nil {
		t.Fatal("expected error on 500")
	}
}

func TestClientGzipDecodeErrorSurfaces(t *testing.T) {
	// Server claims gzip but body is plain — decode error should surface, not be hidden.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = io.WriteString(w, "not actually gzipped")
	}))
	defer srv.Close()

	c := NewClient(newNoCompressionClient(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	if _, err := c.DownloadManami(context.Background()); err == nil {
		t.Fatal("expected gzip decode error to surface")
	}
}
