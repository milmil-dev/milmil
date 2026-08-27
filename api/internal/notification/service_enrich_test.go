package notification

import "testing"

func TestDownloadTitle(t *testing.T) {
	cases := []struct {
		notifType, anime, episode, want string
	}{
		{"download.completed", "Bleach", "05", "Bleach EP5 downloaded"},
		{"download.started", "Bleach", "12", "Bleach EP12 download started"},
		{"download.failed", "Bleach", "", "Bleach download failed"},
		{"download.other", "Bleach", "3", "Bleach EP3"},
	}
	for _, c := range cases {
		if got := DownloadTitle(c.notifType, c.anime, c.episode); got != c.want {
			t.Errorf("DownloadTitle(%q, %q, %q) = %q, want %q", c.notifType, c.anime, c.episode, got, c.want)
		}
	}
}

func TestEnrichDownloadPassesThroughNonDownloadEvents(t *testing.T) {
	s := &Service{}
	title, message, meta := s.enrichDownload(t.Context(), "anime.airing", "t", "m", map[string]any{"k": 1})
	if title != "t" || message != "m" || meta["k"] != 1 {
		t.Fatalf("non-download event was modified: %q %q %v", title, message, meta)
	}
}
