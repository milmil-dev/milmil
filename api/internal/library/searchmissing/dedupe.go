package searchmissing

import (
	"regexp"
	"strconv"
	"strings"
)

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeTitle(s string) string {
	s = strings.ToLower(s)
	s = nonAlnum.ReplaceAllString(s, "")
	return s
}

// Dedupe removes duplicate torrents across providers. Primary key is
// info_hash (lowercased). When hash is absent, falls back to
// normalized title + size.
func Dedupe(rs []Raw) []Raw {
	seenHash := make(map[string]struct{}, len(rs))
	seenFallback := make(map[string]struct{}, len(rs))
	out := make([]Raw, 0, len(rs))
	for _, r := range rs {
		if r.InfoHash != "" {
			key := strings.ToLower(r.InfoHash)
			if _, ok := seenHash[key]; ok {
				continue
			}
			seenHash[key] = struct{}{}
			out = append(out, r)
			continue
		}
		key := normalizeTitle(r.Title) + "|" + strconv.FormatInt(r.SizeBytes, 10)
		if _, ok := seenFallback[key]; ok {
			continue
		}
		seenFallback[key] = struct{}{}
		out = append(out, r)
	}
	return out
}
