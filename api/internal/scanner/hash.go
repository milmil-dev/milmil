// api/internal/scanner/hash.go
package scanner

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"os"
)

const hashReadSize = 16 * 1024 * 1024 // 16MB

// ComputeFileHash computes MD5 hash of the first 16MB of a file.
func ComputeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.CopyN(h, f, hashReadSize); err != nil && err != io.EOF {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
