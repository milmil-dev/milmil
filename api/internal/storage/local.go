package storage

import (
	"io"
	"os"
	"path/filepath"
)

type LocalProvider struct{}

func NewLocalProvider() *LocalProvider { return &LocalProvider{} }

func (p *LocalProvider) Walk(root string, fn filepath.WalkFunc) error {
	return filepath.Walk(root, fn)
}

func (p *LocalProvider) Stat(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

func (p *LocalProvider) Open(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (p *LocalProvider) Close() error { return nil }
