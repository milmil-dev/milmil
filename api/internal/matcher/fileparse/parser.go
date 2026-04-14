package fileparse

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type ParsedFilename struct {
	Title         string
	EpisodeNumber int
	Season        int
	SubGroup      string
	Year          int
}

var (
	reYear          = regexp.MustCompile(`[\(\[](19\d{2}|20\d{2})[\)\]]`)
	reLeadingGroup  = regexp.MustCompile(`^\[([^\]]+)\]\s*`)
	reTrailingTags  = regexp.MustCompile(`\s*\[[^\]]*\]\s*$`)
	reTrailingParen = regexp.MustCompile(`\s*\([^)]*\)\s*$`)
	reSxxExx        = regexp.MustCompile(`(?i)\bS(\d{1,2})E(\d{1,3})\b`)
	reEP            = regexp.MustCompile(`(?i)\bEP\s*(\d{1,3})\b`)
	reDashEp        = regexp.MustCompile(`\s+-\s+(\d{1,3})(?:v\d+)?\s*$`)
	reChinese       = regexp.MustCompile(`第(\d{1,3})[話集话]`)
	reBracketEp     = regexp.MustCompile(`\[(\d{1,3})\]`)
	reBareNumber    = regexp.MustCompile(`^(\d{1,3})$`)
)

func Parse(filename string) ParsedFilename {
	result := ParsedFilename{}
	name := strings.TrimSuffix(filename, filepath.Ext(filename))

	if m := reLeadingGroup.FindStringSubmatch(name); m != nil {
		result.SubGroup = m[1]
		name = name[len(m[0]):]
	}

	if m := reYear.FindStringSubmatch(name); m != nil {
		if y, err := strconv.Atoi(m[1]); err == nil {
			result.Year = y
		}
	}

	for reTrailingTags.MatchString(name) || reTrailingParen.MatchString(name) {
		name = reTrailingTags.ReplaceAllString(name, "")
		name = reTrailingParen.ReplaceAllString(name, "")
	}
	name = strings.TrimSpace(name)

	if m := reSxxExx.FindStringIndex(name); m != nil {
		ms := reSxxExx.FindStringSubmatch(name)
		result.Season, _ = strconv.Atoi(ms[1])
		result.EpisodeNumber, _ = strconv.Atoi(ms[2])
		// Only use the part of the name before the SxxExx token as the title
		title := name[:m[0]]
		result.Title = cleanTitle(title)
		return result
	}

	if m := reDashEp.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reDashEp.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	if m := reEP.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reEP.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	if m := reChinese.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reChinese.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	origName := strings.TrimSuffix(filename, filepath.Ext(filename))
	if result.SubGroup != "" {
		origName = reLeadingGroup.ReplaceAllString(origName, "")
	}
	if matches := reBracketEp.FindAllStringSubmatch(origName, -1); len(matches) > 0 {
		result.EpisodeNumber, _ = strconv.Atoi(matches[0][1])
		title := reBracketEp.ReplaceAllString(origName, "")
		for reTrailingTags.MatchString(title) {
			title = reTrailingTags.ReplaceAllString(title, "")
		}
		result.Title = cleanTitle(title)
		return result
	}

	if m := reBareNumber.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		result.Title = ""
		return result
	}

	result.Title = cleanTitle(name)
	return result
}

func cleanTitle(raw string) string {
	s := strings.ReplaceAll(raw, ".", " ")
	s = strings.ReplaceAll(s, "_", " ")
	s = strings.Trim(s, "- ")
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}
