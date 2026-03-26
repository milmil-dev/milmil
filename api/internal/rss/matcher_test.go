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

func TestMatchRule_EmptyFilter(t *testing.T) {
	if rss.MatchRule("anything", "", "") {
		t.Error("empty filter should not match")
	}
}
