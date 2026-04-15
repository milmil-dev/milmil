package fileparse

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		wantTitle   string
		wantEpisode int
		wantSeason  int
		wantGroup   string
	}{
		{
			name:     "subgroup dash episode",
			filename: "[SubGroup] Anime Title - 01 [1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "SubGroup",
		},
		{
			name:     "subgroup dash episode v2",
			filename: "[Sakurato] Sousou no Frieren - 01v2 [1080p][HEVC].mkv",
			wantTitle: "Sousou no Frieren", wantEpisode: 1, wantSeason: 0, wantGroup: "Sakurato",
		},
		{
			name:     "EP prefix",
			filename: "[SubGroup] My Anime EP01 [720p].mkv",
			wantTitle: "My Anime", wantEpisode: 1, wantSeason: 0, wantGroup: "SubGroup",
		},
		{
			name:     "S01E01 format",
			filename: "Anime Title S01E01 [1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 1, wantGroup: "",
		},
		{
			name:     "S01E01 with dash",
			filename: "Anime Title - S02E05.mkv",
			wantTitle: "Anime Title", wantEpisode: 5, wantSeason: 2, wantGroup: "",
		},
		{
			name:     "chinese episode marker 話",
			filename: "葬送のフリーレン 第01話.mkv",
			wantTitle: "葬送のフリーレン", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "chinese episode marker 集",
			filename: "我的动漫 第3集.mkv",
			wantTitle: "我的动漫", wantEpisode: 3, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "bracketed episode number",
			filename: "[Group] Anime Title [01][1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "Group",
		},
		{
			name:     "dot separated",
			filename: "Anime.Title.S01E01.1080p.BluRay.mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 1, wantGroup: "",
		},
		{
			name:     "double digit episode",
			filename: "[Fansub] Great Anime - 12 [1080p].mkv",
			wantTitle: "Great Anime", wantEpisode: 12, wantSeason: 0, wantGroup: "Fansub",
		},
		{
			name:     "no group simple dash",
			filename: "Anime Title - 05.mkv",
			wantTitle: "Anime Title", wantEpisode: 5, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "three digit episode",
			filename: "[Sub] Long Running Anime - 145 [720p].mkv",
			wantTitle: "Long Running Anime", wantEpisode: 145, wantSeason: 0, wantGroup: "Sub",
		},
		{
			name:     "no episode number",
			filename: "[Sub] Movie Title [1080p].mkv",
			wantTitle: "Movie Title", wantEpisode: 0, wantSeason: 0, wantGroup: "Sub",
		},
		{
			name:     "bare number filename",
			filename: "01.mkv",
			wantTitle: "", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "EP uppercase with space",
			filename: "Anime Title EP 01.mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Parse(tt.filename)
			if got.Title != tt.wantTitle {
				t.Errorf("Title = %q, want %q", got.Title, tt.wantTitle)
			}
			if got.EpisodeNumber != tt.wantEpisode {
				t.Errorf("EpisodeNumber = %d, want %d", got.EpisodeNumber, tt.wantEpisode)
			}
			if got.Season != tt.wantSeason {
				t.Errorf("Season = %d, want %d", got.Season, tt.wantSeason)
			}
			if got.SubGroup != tt.wantGroup {
				t.Errorf("SubGroup = %q, want %q", got.SubGroup, tt.wantGroup)
			}
		})
	}
}

func TestParseExtractsYearFromBracket(t *testing.T) {
	cases := []struct {
		in       string
		wantYear int
	}{
		{"[SubGroup] Some Anime (2023) - 01 [1080p].mkv", 2023},
		{"[Group] Title [2019] - 05.mkv", 2019},
		{"Show Name S02E03 (1999).mp4", 1999},
		{"No Year Show - 01.mkv", 0},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			p := Parse(tc.in)
			if p.Year != tc.wantYear {
				t.Errorf("got %d want %d", p.Year, tc.wantYear)
			}
		})
	}
}

func TestParseExtractsResolution(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"[SubGroup] Some Anime - 01 [1080p].mkv", 1080},
		{"[Group] Title S01E05 720p.mkv", 720},
		{"Show.2160p.BDRip.mkv", 2160},
		{"Show.4K.mkv", 2160},
		{"Show 480p.mp4", 480},
		{"Show.mkv", 0},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			p := Parse(tc.in)
			if p.Resolution != tc.want {
				t.Errorf("got %d want %d", p.Resolution, tc.want)
			}
		})
	}
}
