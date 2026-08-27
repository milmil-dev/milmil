package api

import (
	"testing"

	"github.com/milmil/api/internal/integration/tmdb"
)

// tmdbSeasonInfoForTest is just a local 2-tuple to make the table-driven
// test cases readable without dragging in tmdb.SeasonInfo struct literals.
type tmdbSeasonInfoForTest struct {
	number int
	count  int
}

func toTMDBSeasonInfos(in []tmdbSeasonInfoForTest) []tmdb.SeasonInfo {
	out := make([]tmdb.SeasonInfo, len(in))
	for i, s := range in {
		out[i] = tmdb.SeasonInfo{SeasonNumber: s.number, EpisodeCount: s.count}
	}
	return out
}

func TestParseAcceptLanguageHeader(t *testing.T) {
	cases := []struct {
		header string
		want   string
	}{
		{"", "zh-TW"},
		{"zh-TW,zh-Hant;q=0.9,en;q=0.8", "zh-TW"},
		{"zh-HK,zh-Hant;q=0.9", "zh-HK"},
		{"zh-CN,zh-Hans;q=0.9", "zh-CN"},
		{"zh-Hant", "zh-TW"},
		{"zh-Hans", "zh-CN"},
		{"en-US,en;q=0.9", "en-US"},
		{"ja-JP", "ja-JP"},
		{"ko-KR", "ko-KR"},
		{"de-DE", "zh-TW"}, // unknown — defaults
		{"zh-MO", "zh-HK"},
	}
	for _, tc := range cases {
		t.Run(tc.header, func(t *testing.T) {
			if got := parseAcceptLanguageHeader(tc.header); got != tc.want {
				t.Errorf("parseAcceptLanguageHeader(%q) = %q, want %q", tc.header, got, tc.want)
			}
		})
	}
}

func TestCanonicalizeLocale(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"zh-TW", "zh-TW"},
		{"zh-tw", "zh-TW"},
		{"zh_TW", "zh-TW"},
		{"zh-Hant", "zh-TW"},
		{"zh-Hans", "zh-CN"},
		{"zh-CN", "zh-CN"},
		{"zh-HK", "zh-HK"},
		{"en", "en-US"},
		{"en-GB", "en-US"},
		{"ja", "ja-JP"},
		{"ko", "ko-KR"},
		{"  zh-TW  ", "zh-TW"},
		{"de-DE", ""},
		{"", ""},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := canonicalizeLocale(tc.in); got != tc.want {
				t.Errorf("canonicalizeLocale(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestMapEpisodeToTMDBSeason(t *testing.T) {
	// Rent-a-Girlfriend: 5 seasons of 12 episodes each.
	rag := []tmdbSeasonInfoForTest{
		{0, 5},  // specials — should be skipped
		{1, 12}, // S1: eps 1-12
		{2, 12}, // S2: eps 13-24
		{3, 12}, // S3: eps 25-36
		{4, 12}, // S4: eps 37-48
		{5, 12}, // S5: eps 49-60
	}
	cases := []struct {
		bangumiSort int
		wantSeason  int
		wantEpisode int
		wantOK      bool
	}{
		{1, 1, 1, true},
		{12, 1, 12, true},
		{13, 2, 1, true},
		{49, 5, 1, true},
		{60, 5, 12, true},
		{61, 0, 0, false}, // beyond known seasons
		{0, 0, 0, false},
		{-1, 0, 0, false},
	}
	for _, tc := range cases {
		gotSeason, gotEp, ok := mapEpisodeToTMDBSeason(toTMDBSeasonInfos(rag), tc.bangumiSort)
		if ok != tc.wantOK || gotSeason != tc.wantSeason || gotEp != tc.wantEpisode {
			t.Errorf("mapEpisodeToTMDBSeason(rag, %d) = (%d, %d, %v), want (%d, %d, %v)",
				tc.bangumiSort, gotSeason, gotEp, ok, tc.wantSeason, tc.wantEpisode, tc.wantOK)
		}
	}
}

func TestMapEpisodeToTMDBSeason_HandlesUnsortedInput(t *testing.T) {
	// Verify we don't depend on TMDB returning seasons in order.
	scrambled := []tmdbSeasonInfoForTest{
		{3, 12},
		{1, 12},
		{2, 12},
	}
	season, ep, ok := mapEpisodeToTMDBSeason(toTMDBSeasonInfos(scrambled), 25)
	if !ok || season != 3 || ep != 1 {
		t.Errorf("expected S3 ep1 for episode 25, got S%d ep%d (ok=%v)", season, ep, ok)
	}
}

func TestStripSeasonSuffix(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"彼女、お借りします 第5期", "彼女、お借りします"},
		{"進撃の巨人 The Final Season", "進撃の巨人"},
		{"Re:ゼロから始める異世界生活 2nd Season", "Re:ゼロから始める異世界生活"},
		{"鬼滅の刃 Season 2", "鬼滅の刃"},
		{"無職転生 Part 2", "無職転生"},
		{"オーバーロード IV", "オーバーロード"},
		{"Code Geass S2", "Code Geass"},
		{"葬送のフリーレン", "葬送のフリーレン"},   // no suffix — unchanged
		{"鬼滅の刃 柱稽古編", "鬼滅の刃 柱稽古編"}, // arc suffix isn't stripped
		{"  彼女、お借りします 第5期  ", "彼女、お借りします"},
		{"", ""},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := stripSeasonSuffix(tc.in); got != tc.want {
				t.Errorf("stripSeasonSuffix(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestTMDBXrefKeyIsVersioned(t *testing.T) {
	// New entries land under v2. Bumping xrefVersion is the supported way
	// to invalidate old negatives without flushing the whole cache.
	if got := tmdbXrefKey(123, 0, ""); got != "tmdb:xref:v2:al:123" {
		t.Errorf("anilist key = %q, want tmdb:xref:v2:al:123", got)
	}
	if got := tmdbXrefKey(0, 456, ""); got != "tmdb:xref:v2:bgm:456" {
		t.Errorf("bangumi key = %q, want tmdb:xref:v2:bgm:456", got)
	}
}

func TestSynopsisFallbackChain(t *testing.T) {
	// Ensure zh-TW/HK fall through to zh-CN before Japanese, and that en-US
	// stays minimal (no point looping through all the zh variants).
	got := synopsisFallbackChain("zh-TW")
	if len(got) < 3 || got[0] != "zh-TW" || got[2] != "zh-CN" {
		t.Errorf("zh-TW chain should start zh-TW and include zh-CN, got %v", got)
	}
	got = synopsisFallbackChain("en-US")
	for _, l := range got {
		if l == "zh-CN" || l == "zh-TW" {
			t.Errorf("en-US chain should not include Chinese, got %v", got)
		}
	}
}

func TestLocaleNeedsTMDBOverride(t *testing.T) {
	yes := []string{"zh-TW", "zh-HK", "ja-JP", "ko-KR", "en-US"}
	no := []string{"zh-CN", "de-DE", "", "fr-FR"}
	for _, l := range yes {
		if !localeNeedsTMDBOverride(l) {
			t.Errorf("localeNeedsTMDBOverride(%q) = false, want true", l)
		}
	}
	for _, l := range no {
		if localeNeedsTMDBOverride(l) {
			t.Errorf("localeNeedsTMDBOverride(%q) = true, want false", l)
		}
	}
}

func TestResolveLocale_ClientHeaderBeatsAppearanceSetting(t *testing.T) {
	cases := []struct {
		name                                 string
		explicit, appearance, acceptLanguage string
		want                                 string
	}{
		{"header wins over server setting", "en", "zh-TW", "zh-TW,zh;q=0.9", "en-US"},
		{"macOS bundle localization code", "zh-Hant", "en-US", "", "zh-TW"},
		{"unknown header falls through to setting", "xx", "ja-JP", "en-US", "ja-JP"},
		{"no header uses setting over browser", "", "zh-TW", "en-US", "zh-TW"},
		{"no header or setting uses browser", "", "", "ko-KR,ko;q=0.9", "ko-KR"},
		{"nothing at all defaults to zh-TW", "", "", "", "zh-TW"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveLocale(tc.explicit, tc.appearance, tc.acceptLanguage); got != tc.want {
				t.Errorf("resolveLocale(%q, %q, %q) = %q, want %q", tc.explicit, tc.appearance, tc.acceptLanguage, got, tc.want)
			}
		})
	}
}
