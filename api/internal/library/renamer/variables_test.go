package renamer

import (
	"database/sql"
	"testing"

	"github.com/milmil/api/internal/store"
)

func TestBuildVariables_FillsExtAndResolutionFromFilename(t *testing.T) {
	mf := store.MediaFile{
		Filename: "[SubsPlease] Frieren - 01 (1080p) [ABCD].mkv",
	}
	anime := store.Anime{
		Title:   "Sousou no Frieren",
		TitleEn: sql.NullString{String: "Frieren", Valid: true},
		Year:    sql.NullInt64{Int64: 2023, Valid: true},
	}
	episode := store.Episode{
		EpisodeNumber: 1,
		Title:         sql.NullString{String: "The Journey's End", Valid: true},
	}
	ctx := BuildVariables(mf, anime, episode)
	if ctx.Ext != "mkv" {
		t.Errorf("Ext = %q, want mkv", ctx.Ext)
	}
	if ctx.Resolution != 1080 {
		t.Errorf("Resolution = %d, want 1080", ctx.Resolution)
	}
	if ctx.Subgroup != "SubsPlease" {
		t.Errorf("Subgroup = %q, want SubsPlease", ctx.Subgroup)
	}
	if ctx.Title != "Sousou no Frieren" {
		t.Errorf("Title = %q", ctx.Title)
	}
	if ctx.TitleEn != "Frieren" {
		t.Errorf("TitleEn = %q", ctx.TitleEn)
	}
	if ctx.Year != 2023 {
		t.Errorf("Year = %d", ctx.Year)
	}
	if ctx.EpisodeTitle != "The Journey's End" {
		t.Errorf("EpisodeTitle = %q", ctx.EpisodeTitle)
	}
	if ctx.Season != 1 {
		t.Errorf("Season = %d, want 1", ctx.Season)
	}
	if ctx.EpisodeNumber != 1 {
		t.Errorf("EpisodeNumber = %v", ctx.EpisodeNumber)
	}
}

func TestBuildVariables_HandlesMissingMetadata(t *testing.T) {
	mf := store.MediaFile{Filename: "raw.mp4"}
	anime := store.Anime{Title: "Untitled"}
	episode := store.Episode{EpisodeNumber: 2}
	ctx := BuildVariables(mf, anime, episode)
	if ctx.TitleEn != "" || ctx.TitleZh != "" {
		t.Errorf("expected empty optional titles, got en=%q zh=%q", ctx.TitleEn, ctx.TitleZh)
	}
	if ctx.Year != 0 {
		t.Errorf("Year = %d, want 0", ctx.Year)
	}
	if ctx.EpisodeTitle != "" {
		t.Errorf("EpisodeTitle = %q, want empty", ctx.EpisodeTitle)
	}
	if ctx.Resolution != 0 {
		t.Errorf("Resolution = %d, want 0", ctx.Resolution)
	}
	if ctx.Subgroup != "" {
		t.Errorf("Subgroup = %q, want empty", ctx.Subgroup)
	}
	if ctx.Ext != "mp4" {
		t.Errorf("Ext = %q, want mp4", ctx.Ext)
	}
	if ctx.OriginalFilename != "raw.mp4" {
		t.Errorf("OriginalFilename = %q", ctx.OriginalFilename)
	}
}
