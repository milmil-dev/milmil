package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocalProvider_Walk(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.mkv"), []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	p := NewLocalProvider()
	defer p.Close()

	var found []string
	err := p.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		found = append(found, info.Name())
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0] != "test.mkv" {
		t.Fatalf("expected [test.mkv], got %v", found)
	}
}

func TestLocalProvider_StatAndOpen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	p := NewLocalProvider()
	defer p.Close()

	info, err := p.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() != 5 {
		t.Fatalf("expected size 5, got %d", info.Size())
	}

	rc, err := p.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer rc.Close()
	buf := make([]byte, 5)
	n, _ := rc.Read(buf)
	if string(buf[:n]) != "hello" {
		t.Fatalf("expected hello, got %s", string(buf[:n]))
	}
}

func TestLocalProvider_Delete(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "x.txt")
	if err := os.WriteFile(path, []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	p := NewLocalProvider()
	if err := p.Delete(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("expected file gone, got err=%v", err)
	}
}

func TestLocalProvider_DeleteMissing(t *testing.T) {
	p := NewLocalProvider()
	err := p.Delete(filepath.Join(t.TempDir(), "nope"))
	if !os.IsNotExist(err) {
		t.Errorf("want IsNotExist, got %v", err)
	}
}

func TestLocalProvider_Rename(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "a.txt")
	dst := filepath.Join(dir, "sub", "b.txt")
	if err := os.WriteFile(src, []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	p := NewLocalProvider()
	if err := p.MkdirAll(filepath.Dir(dst)); err != nil {
		t.Fatal(err)
	}
	if err := p.Rename(src, dst); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Errorf("src still there: %v", err)
	}
	if _, err := os.Stat(dst); err != nil {
		t.Errorf("dst missing: %v", err)
	}
}

func TestLocalProvider_MkdirAllIdempotent(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "x", "y", "z")
	p := NewLocalProvider()
	if err := p.MkdirAll(target); err != nil {
		t.Fatal(err)
	}
	if err := p.MkdirAll(target); err != nil {
		t.Errorf("second call should be no-op: %v", err)
	}
}
