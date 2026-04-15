package renamer

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestClampToLibraryRoot_AcceptsCleanRelative(t *testing.T) {
	root := "/tmp/lib"
	got, err := ClampToLibraryRoot(root, "Frieren/S01E01.mkv")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(filepath.Join(root, "Frieren/S01E01.mkv"))
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestClampToLibraryRoot_RejectsEmpty(t *testing.T) {
	if _, err := ClampToLibraryRoot("/tmp/lib", ""); err == nil {
		t.Fatal("expected error for empty rendered path")
	}
	if _, err := ClampToLibraryRoot("/tmp/lib", "   "); err == nil {
		t.Fatal("expected error for whitespace-only rendered path")
	}
}

func TestClampToLibraryRoot_RejectsAbsolute(t *testing.T) {
	if _, err := ClampToLibraryRoot("/tmp/lib", "/etc/passwd"); err == nil {
		t.Fatal("expected error for absolute path")
	}
}

func TestClampToLibraryRoot_RejectsDotDotEscape(t *testing.T) {
	if _, err := ClampToLibraryRoot("/tmp/lib", "../other/file.mkv"); err == nil {
		t.Fatal("expected error for ../ escape")
	}
	if _, err := ClampToLibraryRoot("/tmp/lib", "sub/../../outside.mkv"); err == nil {
		t.Fatal("expected error for nested ../../ escape")
	}
}

func TestClampToLibraryRoot_RejectsSiblingPrefix(t *testing.T) {
	// "/tmp/lib-evil" shares a prefix with "/tmp/lib" but is NOT inside it.
	// filepath.Rel will return "../lib-evil/...", which we reject.
	_, err := ClampToLibraryRoot("/tmp/lib", "../lib-evil/file.mkv")
	if err == nil {
		t.Fatal("expected error for sibling-prefix escape")
	}
	if !strings.Contains(err.Error(), "escapes") {
		t.Errorf("error should mention escape, got: %v", err)
	}
}
