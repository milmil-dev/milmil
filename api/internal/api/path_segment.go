package api

import "strings"

// safePathSegment reports whether s can be joined onto a directory without
// escaping it. Route parameters that end up in a filesystem path — an HLS
// segment name, a media file id used as a cache directory — reach us
// percent-decoded, so a single `:param` can still carry separators and
// `filepath.Join` would happily resolve them away from the intended root.
func safePathSegment(s string) bool {
	if s == "" || s == "." || s == ".." {
		return false
	}
	return !strings.ContainsAny(s, `/\`) && !strings.ContainsRune(s, 0)
}
