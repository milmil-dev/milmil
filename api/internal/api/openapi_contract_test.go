package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// openapi.json is hand-maintained and embedded into the binary, and the public
// documentation site generates its API reference from it. Nothing previously
// checked it against the routes the server actually serves, so the two drifted
// silently: an endpoint could be added, renamed, or removed and the only
// symptom was wrong documentation.
//
// This test compares the two in both directions.

var echoParam = regexp.MustCompile(`:([^/]+)`)

func isHTTPMethod(m string) bool {
	switch m {
	case http.MethodGet, http.MethodPost, http.MethodPut,
		http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

// toOpenAPIPath rewrites Echo's ":id" parameters into OpenAPI's "{id}".
func toOpenAPIPath(p string) string {
	return echoParam.ReplaceAllString(p, "{$1}")
}

// notInSpec lists routes that are deliberately undocumented, with the reason.
var notInSpec = map[string]string{
	"GET /openapi.json": "serves the spec itself",
	"GET /docs":         "renders the human-readable API browser",
	"GET /ws":           "WebSocket upgrade, not an HTTP operation OpenAPI can describe",
}

func TestOpenAPISpecMatchesRegisteredRoutes(t *testing.T) {
	e := newTestApp(t)

	registered := map[string]bool{}
	for _, r := range e.Router().Routes() {
		// Echo synthesises these for CORS and HEAD handling; they are not
		// endpoints anyone documents.
		if r.Method == http.MethodOptions || r.Method == http.MethodHead {
			continue
		}
		// Sentinel entries Echo registers per group to drive 404/405 handling.
		if !isHTTPMethod(r.Method) {
			continue
		}
		// The catch-all any-method entries Echo adds for 405 handling.
		if strings.Contains(r.Path, "*") {
			continue
		}
		// The Jellyfin compatibility layer implements somebody else's API
		// contract; milmil's own spec does not describe it.
		if strings.HasPrefix(r.Path, "/jellyfin") {
			continue
		}
		key := r.Method + " " + toOpenAPIPath(r.Path)
		if _, ok := notInSpec[key]; ok {
			continue
		}
		registered[key] = true
	}

	raw, err := os.ReadFile("openapi.json")
	if err != nil {
		t.Fatalf("read openapi.json: %v", err)
	}
	var spec struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse openapi.json: %v", err)
	}

	documented := map[string]bool{}
	for path, ops := range spec.Paths {
		for method := range ops {
			switch strings.ToLower(method) {
			case "get", "post", "put", "patch", "delete":
				documented[strings.ToUpper(method)+" "+path] = true
			}
		}
	}

	var undocumented, phantom []string
	for k := range registered {
		if !documented[k] {
			undocumented = append(undocumented, k)
		}
	}
	for k := range documented {
		if !registered[k] {
			phantom = append(phantom, k)
		}
	}
	sort.Strings(undocumented)
	sort.Strings(phantom)

	if len(undocumented) > 0 {
		t.Errorf("%d route(s) served but missing from openapi.json:\n  %s",
			len(undocumented), strings.Join(undocumented, "\n  "))
	}
	if len(phantom) > 0 {
		t.Errorf("%d operation(s) in openapi.json that no route serves:\n  %s",
			len(phantom), strings.Join(phantom, "\n  "))
	}
}
