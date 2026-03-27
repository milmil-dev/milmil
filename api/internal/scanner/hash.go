// api/internal/scanner/hash.go
package scanner

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"os"
)

const hashReadSize = 16 * 1024 * 1024 // 16MB

// ComputeFileHash computes MD5 hash of the first 16MB of a file at the given path.
func ComputeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	return ComputeFileHashFromReader(f)
}

// ComputeFileHashFromReader computes MD5 hash of the first 16MB read from r.
func ComputeFileHashFromReader(r io.Reader) (string, error) {
	h := md5.New()
	if _, err := io.CopyN(h, r, hashReadSize); err != nil && err != io.EOF {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
