package api

import "net/http"

// CheckWSOrigin exposes the WebSocket origin guard to the external test package.
func CheckWSOrigin(r *http.Request) bool { return checkWSOrigin(r) }

// RedactURI exposes the access-log URI scrubber to the external test package.
func RedactURI(uri string) string { return redactURI(uri) }
