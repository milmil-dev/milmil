package renamer

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/store"
)

// fakeStater simulates a filesystem probe. Paths in Present return (nil, nil)
// to indicate existence; anything else returns an error.
type fakeStater struct {
	Present map[string]bool
}

func (f *fakeStater) Stat(path string) (any, error) {
	if f.Present[path] {
		return struct{}{}, nil
	}
	return nil, errors.New("not found")
}

func TestPlan_OKPath(t *testing.T) {
	root := "/tmp/lib"
	c, _ := Compile("{{.Title}}/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}")
	fc := FileContext{
		MediaFile: store.MediaFile{ID: "mf1", Path: "/tmp/lib/old/path.mkv", Filename: "path.mkv"},
		Anime:     store.Anime{Title: "Frieren"},
		Episode:   store.Episode{EpisodeNumber: 1},
	}
	results := Plan(context.Background(), []FileContext{fc}, c, root, &fakeStater{})
	if len(results) != 1 {
		t.Fatalf("len = %d", len(results))
	}
	r := results[0]
	if r.Status != StatusOK {
		t.Errorf("status = %q, want ok; err=%q", r.Status, r.Error)
	}
	want, _ := filepath.Abs("/tmp/lib/Frieren/S01E01.mkv")
	if r.NewPath != want {
		t.Errorf("NewPath = %q, want %q", r.NewPath, want)
	}
}

func TestPlan_SkipSameAsCurrent(t *testing.T) {
	root := "/tmp/lib"
	c, _ := Compile("same.mkv")
	abs, _ := filepath.Abs("/tmp/lib/same.mkv")
	fc := FileContext{
		MediaFile: store.MediaFile{ID: "mf1", Path: abs, Filename: "same.mkv"},
		Anime:     store.Anime{Title: "Frieren"},
		Episode:   store.Episode{EpisodeNumber: 1},
	}
	results := Plan(context.Background(), []FileContext{fc}, c, root, &fakeStater{})
	if results[0].Status != StatusSkipSameAsCurrent {
		t.Errorf("status = %q, want skip_same_as_current", results[0].Status)
	}
}

func TestPlan_SkipCollision(t *testing.T) {
	root := "/tmp/lib"
	c, _ := Compile("collide.mkv")
	target, _ := filepath.Abs("/tmp/lib/collide.mkv")
	fc := FileContext{
		MediaFile: store.MediaFile{ID: "mf1", Path: "/tmp/lib/something-else.mkv", Filename: "something-else.mkv"},
		Anime:     store.Anime{Title: "Frieren"},
		Episode:   store.Episode{EpisodeNumber: 1},
	}
	stater := &fakeStater{Present: map[string]bool{target: true}}
	results := Plan(context.Background(), []FileContext{fc}, c, root, stater)
	if results[0].Status != StatusSkipCollision {
		t.Errorf("status = %q, want skip_collision", results[0].Status)
	}
}

func TestPlan_ErrorOnClampEscape(t *testing.T) {
	root := "/tmp/lib"
	c, _ := Compile("../escape.mkv")
	fc := FileContext{
		MediaFile: store.MediaFile{ID: "mf1", Path: "/tmp/lib/a.mkv", Filename: "a.mkv"},
		Anime:     store.Anime{Title: "Frieren"},
		Episode:   store.Episode{EpisodeNumber: 1},
	}
	results := Plan(context.Background(), []FileContext{fc}, c, root, &fakeStater{})
	if results[0].Status != StatusError {
		t.Errorf("status = %q, want error", results[0].Status)
	}
	if results[0].Error == "" {
		t.Errorf("Error should be populated")
	}
}

