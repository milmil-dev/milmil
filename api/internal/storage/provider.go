package storage

import (
	"io"
	"os"
	"path/filepath"
)

// Provider abstracts filesystem operations for different storage backends.
type Provider interface {
	Walk(root string, fn filepath.WalkFunc) error
	Stat(path string) (os.FileInfo, error)
	Open(path string) (io.ReadCloser, error)
	ReadDir(path string) ([]os.FileInfo, error)
	Delete(path string) error
	Rename(oldPath, newPath string) error
	MkdirAll(path string) error
	Close() error
}
