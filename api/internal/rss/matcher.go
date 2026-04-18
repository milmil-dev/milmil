package rss

import (
	"regexp"
	"strings"
)

// resolutionAliases maps a canonical filter value to the list of substrings
// (lowercased) that should satisfy it in a torrent title. Mirror of the
// frontend matchesResolution() aliases — torrent groups label the same
// resolution differently (4K ↔ 2160p ↔ UHD, 1080p ↔ FHD, etc.).
var resolutionAliases = map[string][]string{
	"4k":    {"4k", "2160p", "uhd"},
	"2160p": {"4k", "2160p", "uhd"},
	"1080p": {"1080p", "fhd", "fullhd"},
	"720p":  {"720p", "hd"},
}

// MatchesResolution reports whether title satisfies the resolution filter,
// accepting common aliases. An empty filter matches anything.
func MatchesResolution(title, filter string) bool {
	if filter == "" {
		return true
	}
	lowerTitle := strings.ToLower(title)
	key := strings.ToLower(strings.TrimSpace(filter))
	needles, ok := resolutionAliases[key]
	if !ok {
		needles = []string{key}
	}
	for _, n := range needles {
		if strings.Contains(lowerTitle, n) {
			return true
		}
	}
	return false
}

func MatchRule(title, filterRegex, excludeRegex string) bool {
	// Empty filter regex → match nothing. A rule with no filter has no
	// intent and should not accidentally sweep an entire feed.
	if filterRegex == "" {
		return false
	}
	matched, err := regexp.MatchString(filterRegex, title)
	if err != nil || !matched {
		return false
	}
	if excludeRegex != "" {
		excluded, err := regexp.MatchString(excludeRegex, title)
		if err == nil && excluded {
			return false
		}
	}
	return true
}
