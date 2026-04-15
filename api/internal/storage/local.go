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

func (p *LocalProvider) ReadDir(path string) ([]os.FileInfo, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}
	infos := make([]os.FileInfo, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		infos = append(infos, info)
	}
	return infos, nil
}

func (p *LocalProvider) Delete(path string) error {
	return os.Remove(path)
}

func (p *LocalProvider) Close() error { return nil }
