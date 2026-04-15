package renamer

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ClampToLibraryRoot joins a rendered (template-output) relative path onto the
// library root, rejecting anything that:
//   - is empty or whitespace
//   - is an absolute path
//   - escapes the library root via "..", symlink-style, or sibling-prefix
//
// Returns the absolute joined path on success.
func ClampToLibraryRoot(root, rendered string) (string, error) {
	if strings.TrimSpace(rendered) == "" {
		return "", fmt.Errorf("empty rendered path")
	}
	if filepath.IsAbs(rendered) {
		return "", fmt.Errorf("absolute path rejected: %s", rendered)
	}
	cleaned := filepath.Clean(rendered)
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absJoined, err := filepath.Abs(filepath.Join(absRoot, cleaned))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absRoot, absJoined)
	if err != nil {
		return "", fmt.Errorf("path escapes library root: %s", rendered)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes library root: %s", rendered)
	}
	return absJoined, nil
}
