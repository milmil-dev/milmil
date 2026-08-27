package danmaku

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestWbiSign_KnownAnswer(t *testing.T) {
	// Vectors cross-checked against the reference Python implementation
	// (bilibili-API-collect) with the same inputs.
	mixin := wbiMixinKey("7cd084941338484aae1ad9425b84077c", "4932caff0ff746eab6f01bf08b70ac45")
	if mixin != "ea1db124af3c7062474693fa704f4ff8" {
		t.Fatalf("mixin key = %q", mixin)
	}
	params := url.Values{}
	params.Set("foo", "114")
	params.Set("bar", "514")
	params.Set("zab", "1919810")
	params.Set("keyword", "死神 41 (x)!*'")
	signed := wbiSign(params, mixin, time.Unix(1702204169, 0))
	if got := signed.Get("w_rid"); got != "925a211d70db499ac25f9b44e8df6e14" {
		t.Errorf("w_rid = %s", got)
	}
	if got := signed.Get("keyword"); got != "死神 41 x" {
		t.Errorf("keyword should lose !'()* : %q", got)
	}
	if params.Get("wts") != "" {
		t.Error("input params must not be mutated")
	}
	if wbiKeyFromURL("https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png") != "7cd084941338484aae1ad9425b84077c" {
		t.Error("wbiKeyFromURL")
	}
}

// fakeBilibili stands in for api.bilibili.com: it hands out a buvid, takes
// the activation post, publishes WBI keys and answers a signed search. It can
// be told to block the next search with an HTML page.
type fakeBilibili struct {
	spiCalls      atomic.Int32
	activateCalls atomic.Int32
	blockNext     atomic.Bool
	lastSearch    atomic.Pointer[http.Request]
}

func (f *fakeBilibili) handler(t *testing.T) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/x/frontend/finger/spi", func(w http.ResponseWriter, r *http.Request) {
		f.spiCalls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"b_3":"B3-TEST-buvid3infoc","b_4":"B4-TEST"}}`))
	})
	mux.HandleFunc("/x/internal/gaia-gateway/ExClimbWuzhi", func(w http.ResponseWriter, r *http.Request) {
		f.activateCalls.Add(1)
		if r.Method != http.MethodPost || !strings.Contains(r.Header.Get("Cookie"), "buvid3=B3-TEST") {
			t.Errorf("activation must POST with the buvid3 cookie, got %s %q", r.Method, r.Header.Get("Cookie"))
		}
		_, _ = w.Write([]byte(`{"code":0,"data":{}}`))
	})
	mux.HandleFunc("/x/web-interface/nav", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":-101,"data":{"wbi_img":{"img_url":"https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png","sub_url":"https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"}}}`))
	})
	mux.HandleFunc("/x/web-interface/wbi/search/type", func(w http.ResponseWriter, r *http.Request) {
		f.lastSearch.Store(r)
		if f.blockNext.CompareAndSwap(true, false) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<!DOCTYPE HTML><html><body>risk control</body></html>"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"result":[{"bvid":"BV1xx","title":"<em class=\"keyword\">死神</em> 41","duration":"23:40","pic":"//i0.hdslb.com/p.jpg","video_review":1234}]}}`))
	})
	mux.HandleFunc("/x/web-interface/search/type", func(w http.ResponseWriter, r *http.Request) {
		t.Error("unsigned legacy search endpoint must not be used")
	})
	return mux
}

func newTestSource(t *testing.T) (*BilibiliSource, *fakeBilibili) {
	t.Helper()
	f := &fakeBilibili{}
	srv := httptest.NewServer(f.handler(t))
	t.Cleanup(srv.Close)
	src := NewBilibiliSource(srv.Client())
	src.apiBase = srv.URL
	return src, f
}

func TestBilibiliSearch_SignsAndReusesSession(t *testing.T) {
	src, f := newTestSource(t)
	ctx := context.Background()

	for range 2 {
		results, err := src.Search(ctx, "死神 41", 1)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if len(results) != 1 || results[0].VideoID != "BV1xx" || results[0].Title != "死神 41" || results[0].DanmakuCount != 1234 {
			t.Fatalf("unexpected results %+v", results)
		}
	}
	if f.spiCalls.Load() != 1 || f.activateCalls.Load() != 1 {
		t.Errorf("session should be built once: spi=%d activate=%d", f.spiCalls.Load(), f.activateCalls.Load())
	}

	req := f.lastSearch.Load()
	q := req.URL.Query()
	if q.Get("w_rid") == "" || q.Get("wts") == "" {
		t.Errorf("search must be WBI-signed, query=%s", req.URL.RawQuery)
	}
	mixin := wbiMixinKey("7cd084941338484aae1ad9425b84077c", "4932caff0ff746eab6f01bf08b70ac45")
	want := url.Values{}
	for k, v := range q {
		if k != "w_rid" {
			want[k] = v
		}
	}
	wts, _ := time.Parse("", "")
	_ = wts
	// Re-sign with the server's wts to check the digest.
	unsigned := url.Values{}
	for k, v := range want {
		if k != "wts" {
			unsigned[k] = v
		}
	}
	var wtsSec int64
	for _, c := range q.Get("wts") {
		wtsSec = wtsSec*10 + int64(c-'0')
	}
	if got := wbiSign(unsigned, mixin, time.Unix(wtsSec, 0)).Get("w_rid"); got != q.Get("w_rid") {
		t.Errorf("w_rid mismatch: server saw %s, recomputed %s", q.Get("w_rid"), got)
	}
	cookie := req.Header.Get("Cookie")
	for _, part := range []string{"buvid3=B3-TEST", "buvid4=B4-TEST", "b_nut=", "_uuid="} {
		if !strings.Contains(cookie, part) {
			t.Errorf("cookie missing %s: %q", part, cookie)
		}
	}
}

func TestBilibiliSearch_BlockPageResetsSessionAndRetries(t *testing.T) {
	src, f := newTestSource(t)
	ctx := context.Background()

	if _, err := src.Search(ctx, "warm", 1); err != nil {
		t.Fatalf("warm-up: %v", err)
	}
	f.blockNext.Store(true)
	results, err := src.Search(ctx, "死神 41", 1)
	if err != nil {
		t.Fatalf("search after block should recover: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected results after retry, got %d", len(results))
	}
	if f.spiCalls.Load() != 2 {
		t.Errorf("block page should force a new session, spi calls = %d", f.spiCalls.Load())
	}
}

// TestBilibiliSearch_Live hits the real API; opt in with BILIBILI_LIVE=1.
func TestBilibiliSearch_Live(t *testing.T) {
	if os.Getenv("BILIBILI_LIVE") == "" {
		t.Skip("set BILIBILI_LIVE=1 to run against api.bilibili.com")
	}
	src := NewBilibiliSource(&http.Client{Timeout: 15 * time.Second})
	results, err := src.Search(context.Background(), "死神 41", 1)
	if err != nil {
		t.Fatalf("live search: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("live search returned no results")
	}
	t.Logf("%d results, first: %s (%s, %d danmaku)", len(results), results[0].Title, results[0].VideoID, results[0].DanmakuCount)
	parts, err := src.GetParts(context.Background(), results[0].VideoID)
	if err != nil {
		t.Fatalf("live parts: %v", err)
	}
	t.Logf("%d parts", len(parts))
}
