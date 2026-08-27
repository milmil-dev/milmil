package api

import (
	"os"
	"regexp"
	"testing"
	"unicode"
)

// seededHotTags reads the tag vocabulary straight out of the migration that
// seeds `hot_tags`, so adding a tag there without a translation fails here
// instead of silently shipping a Chinese chip to an English UI.
func seededHotTags(t *testing.T) []string {
	t.Helper()
	sql, err := os.ReadFile("../../migrations/000022_create_hot_tags.up.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	matches := regexp.MustCompile(`\('([^']+)', '[^']+', \d+\)`).FindAllStringSubmatch(string(sql), -1)
	if len(matches) == 0 {
		t.Fatal("no seeded tags found in migration")
	}
	tags := make([]string, 0, len(matches))
	for _, m := range matches {
		tags = append(tags, m[1])
	}
	return tags
}

func isCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func TestLocalizeTagCoversSeededVocabulary(t *testing.T) {
	for _, tag := range seededHotTags(t) {
		if !isCJK(tag) {
			continue // MAPPA, BONES, ufotable … read the same in every locale
		}
		names, ok := hotTagNames[tag]
		if !ok {
			t.Errorf("seeded tag %q has no display names", tag)
			continue
		}
		if names.en == "" || names.ja == "" || names.ko == "" {
			t.Errorf("seeded tag %q is missing a display name: %+v", tag, names)
		}
	}
}

func TestLocalizeTag(t *testing.T) {
	cases := []struct {
		name, locale, want string
	}{
		{"漫畫改編", "en-US", "Manga Adaptation"},
		{"漫畫改編", "ja-JP", "漫画原作"},
		{"漫畫改編", "ko-KR", "만화 원작"},
		{"漫畫改編", "zh-TW", "漫畫改編"},
		{"漫畫改編", "zh-HK", "漫畫改編"},
		{"漫畫改編", "zh-CN", "漫画改编"},
		{"MAPPA", "en-US", "MAPPA"},
		// Per-title Bangumi tags are outside the seeded vocabulary.
		{"尾田榮一郎", "en-US", "尾田榮一郎"},
	}
	for _, tc := range cases {
		if got := localizeTag(tc.name, tc.locale); got != tc.want {
			t.Errorf("localizeTag(%q, %q) = %q, want %q", tc.name, tc.locale, got, tc.want)
		}
	}
}
