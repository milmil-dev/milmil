package anidb

import (
	"os"
	"testing"
)

func TestMappingResolveByEachSource(t *testing.T) {
	data, err := os.ReadFile("testdata/manami-sample.json")
	if err != nil {
		t.Fatal(err)
	}
	m, err := LoadMapping(data)
	if err != nil {
		t.Fatal(err)
	}

	want := IDSet{AniDB: 23, MAL: 1, AniList: 1, Kitsu: 1, TMDB: 30991}

	cases := []struct {
		name string
		src  Source
		id   int64
	}{
		{"anidb", SourceAniDB, 23},
		{"mal", SourceMAL, 1},
		{"anilist", SourceAniList, 1},
		{"kitsu", SourceKitsu, 1},
		{"tmdb", SourceTMDB, 30991},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := m.Resolve(tc.src, tc.id)
			if !ok {
				t.Fatalf("expected hit for %s=%d", tc.src, tc.id)
			}
			if got != want {
				t.Errorf("got %+v want %+v", got, want)
			}
		})
	}
}

func TestMappingMissReturnsFalse(t *testing.T) {
	data, _ := os.ReadFile("testdata/manami-sample.json")
	m, _ := LoadMapping(data)
	if _, ok := m.Resolve(SourceAniDB, 99999); ok {
		t.Error("expected miss")
	}
}

func TestMappingPartialEntry(t *testing.T) {
	data, _ := os.ReadFile("testdata/manami-sample.json")
	m, _ := LoadMapping(data)
	got, ok := m.Resolve(SourceAniList, 20612)
	if !ok {
		t.Fatal("expected hit")
	}
	if got.AniList != 20612 || got.AniDB != 0 || got.MAL != 0 {
		t.Errorf("partial resolution wrong: %+v", got)
	}
}

func TestMappingMergesAnimeListsBangumi(t *testing.T) {
	manami, _ := os.ReadFile("testdata/manami-sample.json")
	al, _ := os.ReadFile("testdata/anime-lists-sample.xml")

	m, _ := LoadMapping(manami)
	extras, err := LoadAnimeListsMapping(al)
	if err != nil {
		t.Fatal(err)
	}
	m.MergeIDSets(extras)

	set, ok := m.Resolve(SourceBangumi, 253)
	if !ok {
		t.Fatal("expected bangumi 253 to resolve")
	}
	if set.AniDB != 23 || set.MAL != 1 {
		t.Errorf("expected bangumi→{anidb=23, mal=1}, got %+v", set)
	}

	// Reverse direction: anidb=23 should now also know bangumi=253.
	set, ok = m.Resolve(SourceAniDB, 23)
	if !ok || set.Bangumi != 253 {
		t.Errorf("expected anidb=23→bangumi=253, got %+v", set)
	}
}

func TestMappingAnimeListsOnlyEntry(t *testing.T) {
	// anidb=979 (Monster) is in anime-lists but NOT in manami sample.
	al, _ := os.ReadFile("testdata/anime-lists-sample.xml")
	m, _ := LoadMapping([]byte(`{"data":[]}`))
	extras, _ := LoadAnimeListsMapping(al)
	m.MergeIDSets(extras)

	set, ok := m.Resolve(SourceAniDB, 979)
	if !ok || set.Bangumi != 1685 {
		t.Errorf("expected anidb=979→bangumi=1685, got %+v ok=%v", set, ok)
	}
}
