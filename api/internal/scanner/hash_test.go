package scanner_test

import (
	"crypto/md5"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/milmil/api/internal/scanner"
)

func TestComputeFileHash_SmallFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "small.mkv")
	content := []byte("hello world video content")
	os.WriteFile(path, content, 0644)

	hash, err := scanner.ComputeFileHash(path)
	if err != nil {
		t.Fatal(err)
	}

	expected := md5.Sum(content)
	expectedHex := hex.EncodeToString(expected[:])
	if hash != expectedHex {
		t.Errorf("want %s, got %s", expectedHex, hash)
	}
}

func TestComputeFileHash_LargeFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.mkv")
	// Create 20MB file — hash should only use first 16MB
	content := []byte(strings.Repeat("A", 20*1024*1024))
	os.WriteFile(path, content, 0644)

	hash, err := scanner.ComputeFileHash(path)
	if err != nil {
		t.Fatal(err)
	}

	// Expected: MD5 of first 16MB
	first16MB := content[:16*1024*1024]
	expected := md5.Sum(first16MB)
	expectedHex := hex.EncodeToString(expected[:])
	if hash != expectedHex {
		t.Errorf("want %s, got %s", expectedHex, hash)
	}
}

func TestComputeFileHash_NonExistent(t *testing.T) {
	_, err := scanner.ComputeFileHash("/nonexistent/file.mkv")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}
