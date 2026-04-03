package rss

import (
	"regexp"
	"strconv"
	"strings"
)

// ParseSubgroup extracts [SubGroup] from title.
func ParseSubgroup(title string) string {
	if len(title) > 0 && title[0] == '[' {
		end := strings.Index(title, "]")
		if end > 0 {
			return title[1:end]
		}
	}
	return ""
}

// episodeRe matches common episode patterns in torrent titles.
var episodeRe = regexp.MustCompile(`\s-\s(\d{1,3})\b|\[(\d{1,3})\]|S\d{1,2}E(\d{1,3})`)

// ParseEpisode extracts episode number from title.
func ParseEpisode(title string) string {
	m := episodeRe.FindStringSubmatch(title)
	if len(m) > 0 {
		for _, g := range m[1:] {
			if g != "" {
				return g
			}
		}
	}
	return ""
}

// InEpisodeRange checks if an episode number falls within a range string like "1-12".
func InEpisodeRange(ep, rangeStr string) bool {
	parts := strings.SplitN(rangeStr, "-", 2)
	epNum, err := strconv.Atoi(ep)
	if err != nil {
		return true // can't parse, allow
	}
	if len(parts) == 2 {
		start, _ := strconv.Atoi(strings.TrimSpace(parts[0]))
		end, _ := strconv.Atoi(strings.TrimSpace(parts[1]))
		return epNum >= start && epNum <= end
	}
	// Single number — exact match
	single, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return true
	}
	return epNum == single
}
