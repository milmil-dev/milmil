package rss_test

import (
	"testing"

	"github.com/milmil/api/internal/rss"
)

func TestMatchRule_Match(t *testing.T) {
	if !rss.MatchRule("[Lilith-Raws] Frieren - 07 [1080p]", "Frieren", "") {
		t.Error("should match")
	}
}

func TestMatchRule_Exclude(t *testing.T) {
	if rss.MatchRule("[Lilith-Raws] Frieren - 07 [720p]", "Frieren", "720p") {
		t.Error("should be excluded")
	}
}

func TestMatchRule_NoMatch(t *testing.T) {
	if rss.MatchRule("[Sub] JJK - 01", "Frieren", "") {
		t.Error("should not match")
	}
}

// Release titles mix cases freely ("[ANi] BLEACH 死神…" vs "[ANi] Bleach
// Sennen Kessenhen…"); a case-sensitive filter silently splits a season.
func TestMatchRule_CaseInsensitive(t *testing.T) {
	if !rss.MatchRule("[ANi]  BLEACH 死神 千年血戰篇-禍進譚- - 42 [1080P]", "Bleach", "") {
		t.Error("filter should match regardless of case")
	}
	if rss.MatchRule("[ANi] Bleach - 42 [720P]", "Bleach", "720p") {
		t.Error("exclude should match regardless of case")
	}
}

func TestMatchRule_EmptyFilter(t *testing.T) {
	if rss.MatchRule("anything", "", "") {
		t.Error("empty filter should not match")
	}
}

func TestMatchesResolution(t *testing.T) {
	cases := []struct {
		name   string
		title  string
		filter string
		want   bool
	}{
		{"empty filter matches anything", "[Group] Show - 01 [1080p]", "", true},
		{"1080p literal", "[Group] Show - 01 [1080p]", "1080p", true},
		{"720p literal", "[Group] Show - 01 [720p]", "720p", true},
		{"4K matches 2160p", "[沸班亚马制作组] 尖帽子的魔法工房 - 03 [CR WebRip AI2160p HEVC AAC]", "4K", true},
		{"4K matches UHD", "[Group] Show - 01 [UHD BluRay]", "4K", true},
		{"4K literal", "[Group] Show - 01 [4K WEB-DL]", "4K", true},
		{"4k lowercase input", "[Group] Show - 01 [2160p]", "4k", true},
		{"1080p matches FHD", "[Group] Show - 01 [FHD WEB-DL]", "1080p", true},
		{"4K does not match 1080p title", "[Group] Show - 01 [1080p]", "4K", false},
		{"720p does not match 1080p title", "[Group] Show - 01 [1080p]", "720p", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := rss.MatchesResolution(tc.title, tc.filter); got != tc.want {
				t.Errorf("MatchesResolution(%q, %q) = %v, want %v", tc.title, tc.filter, got, tc.want)
			}
		})
	}
}
