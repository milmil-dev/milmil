package anidb

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func loadTitles(t *testing.T) *TitleIndex {
	t.Helper()
	data, err := os.ReadFile("testdata/titles-sample.xml")
	if err != nil {
		t.Fatal(err)
	}
	idx, err := LoadTitleIndex(data)
	if err != nil {
		t.Fatal(err)
	}
	return idx
}

func TestTitlesExactEnglishMatch(t *testing.T) {
	idx := loadTitles(t)
	cs := idx.Search("Cowboy Bebop", 0)
	if len(cs) == 0 {
		t.Fatal("expected hits")
	}
	if cs[0].AniDBID != 23 {
		t.Errorf("got aid=%d", cs[0].AniDBID)
	}
	if cs[0].Score < 0.99 {
		t.Errorf("expected near-1.0 score, got %v", cs[0].Score)
	}
}

func TestTitlesCaseAndPunctuationInsensitive(t *testing.T) {
	idx := loadTitles(t)
	cs := idx.Search("cowboy  bebop!", 0)
	if len(cs) == 0 || cs[0].AniDBID != 23 {
		t.Fatalf("got %+v", cs)
	}
}

func TestTitlesAmbiguousReturnsMultiple(t *testing.T) {
	idx := loadTitles(t)
	cs := idx.Search("Monster", 0)
	if len(cs) < 2 {
		t.Fatalf("expected >=2 candidates for 'Monster', got %d", len(cs))
	}
	if cs[0].AniDBID != 979 {
		t.Errorf("expected exact-match 'Monster' (aid=979) ranked first, got aid=%d", cs[0].AniDBID)
	}
}

func TestTitlesJapaneseHit(t *testing.T) {
	idx := loadTitles(t)
	cs := idx.Search("カウボーイビバップ", 0)
	if len(cs) == 0 || cs[0].AniDBID != 23 {
		t.Fatalf("got %+v", cs)
	}
}

func TestTitlesPerfWithLargeIndex(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	var b strings.Builder
	b.WriteString(`<?xml version="1.0"?><animetitles>`)
	for i := 0; i < 50000; i++ {
		fmt.Fprintf(&b, `<anime aid="%d"><title>Series Number %d</title></anime>`, i, i)
	}
	b.WriteString(`</animetitles>`)
	idx, err := LoadTitleIndex([]byte(b.String()))
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	cs := idx.Search("Series Number 12345", 0)
	elapsed := time.Since(start)
	// Race instrumentation slows this by ~10x, so the wall-clock budget only
	// means something in an uninstrumented build. Correctness is checked either way.
	if !raceEnabled && elapsed > 1*time.Second {
		t.Errorf("search too slow: %v (must be <1s)", elapsed)
	}
	if len(cs) == 0 || cs[0].AniDBID != 12345 {
		t.Errorf("wrong top hit: %+v", cs)
	}
}
