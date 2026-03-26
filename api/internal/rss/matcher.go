package rss

import "regexp"

func MatchRule(title, filterRegex, excludeRegex string) bool {
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
