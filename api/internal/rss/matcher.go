package rss

import "regexp"

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
