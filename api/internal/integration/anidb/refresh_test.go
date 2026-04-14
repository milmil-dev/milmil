package anidb

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

const sampleManami = `{"data":[{"sources":["https://anidb.net/anime/23","https://myanimelist.net/anime/1"]}]}`
const sampleAnimeLists = `<anime-list><anime anidbid="23"><bangumiid>253</bangumiid></anime></anime-list>`
const sampleTitles = `<?xml version="1.0"?><animetitles><anime aid="23"><title>Cowboy Bebop</title></anime></animetitles>`

func newRefreshServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manami.json":
			_, _ = io.WriteString(w, sampleManami)
		case "/anime-lists.xml":
			_, _ = io.WriteString(w, sampleAnimeLists)
		case "/titles.xml.gz":
			gw := gzip.NewWriter(w)
			_, _ = io.WriteString(gw, sampleTitles)
			_ = gw.Close()
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestServiceRefreshLoadsAndServes(t *testing.T) {
	srv := newRefreshServer(t)
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient(srv.Client(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	s := NewService(c, dir)

	if err := s.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	set, ok := s.Resolve(SourceMAL, 1)
	if !ok || set.AniDB != 23 || set.Bangumi != 253 {
		t.Errorf("resolve failed: %+v ok=%v", set, ok)
	}
	cs := s.SearchTitles("cowboy bebop", 0)
	if len(cs) == 0 || cs[0].AniDBID != 23 {
		t.Errorf("search failed: %+v", cs)
	}
}

func TestServiceRespectsRateLimit(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		switch r.URL.Path {
		case "/manami.json":
			_, _ = io.WriteString(w, `{"data":[]}`)
		case "/anime-lists.xml":
			_, _ = io.WriteString(w, `<anime-list></anime-list>`)
		case "/titles.xml.gz":
			gw := gzip.NewWriter(w)
			_, _ = io.WriteString(gw, `<animetitles></animetitles>`)
			_ = gw.Close()
		}
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient(srv.Client(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	s := NewService(c, dir)
	s.SetMinInterval(24 * time.Hour)

	if err := s.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	first := calls
	if err := s.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != first {
		t.Errorf("expected rate-limited refresh to skip network, got %d extra calls", calls-first)
	}
}

func TestServiceReloadsFromDiskOnStartup(t *testing.T) {
	srv := newRefreshServer(t)
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient(srv.Client(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	s1 := NewService(c, dir)
	if err := s1.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}

	for _, f := range []string{"manami.json", "anime-lists.xml", "titles.xml", "last-fetch.json"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Errorf("missing %s: %v", f, err)
		}
	}

	s2 := NewService(nil, dir)
	if err := s2.LoadFromDisk(); err != nil {
		t.Fatal(err)
	}
	if _, ok := s2.Resolve(SourceAniDB, 23); !ok {
		t.Error("expected hydration from disk to populate mapping")
	}
}

func TestServiceRefreshFailureKeepsOldCache(t *testing.T) {
	var fail bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		switch r.URL.Path {
		case "/manami.json":
			_, _ = io.WriteString(w, sampleManami)
		case "/anime-lists.xml":
			_, _ = io.WriteString(w, sampleAnimeLists)
		case "/titles.xml.gz":
			gw := gzip.NewWriter(w)
			_, _ = io.WriteString(gw, sampleTitles)
			_ = gw.Close()
		}
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient(srv.Client(), srv.URL+"/manami.json", srv.URL+"/anime-lists.xml", srv.URL+"/titles.xml.gz")
	s := NewService(c, dir)
	s.SetMinInterval(0) // disable rate limit so second call is attempted
	if err := s.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}

	fail = true
	if err := s.Refresh(context.Background()); err == nil {
		t.Fatal("expected error on failed refresh")
	}
	// Old cache must still serve.
	if _, ok := s.Resolve(SourceAniDB, 23); !ok {
		t.Error("old cache lost after failed refresh")
	}
}

func TestLoadFromDiskWithMissingTitlesReturnsError(t *testing.T) {
	dir := t.TempDir()
	// Write only manami + anime-lists, omit titles.
	_ = os.WriteFile(filepath.Join(dir, "manami.json"), []byte(sampleManami), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "anime-lists.xml"), []byte(sampleAnimeLists), 0o644)

	s := NewService(nil, dir)
	if err := s.LoadFromDisk(); err == nil {
		t.Fatal("expected error on missing titles.xml")
	}
	// Service stays empty — Resolve and SearchTitles must return zero/nil safely.
	if set, ok := s.Resolve(SourceAniDB, 23); ok || set != (IDSet{}) {
		t.Errorf("expected empty resolve, got %+v ok=%v", set, ok)
	}
	if cs := s.SearchTitles("anything", 0); cs != nil {
		t.Errorf("expected nil candidates, got %+v", cs)
	}
}
