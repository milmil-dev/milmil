package search

import (
	"unicode"

	"github.com/longbridgeapp/opencc"
)

var (
	t2s *opencc.OpenCC
	s2t *opencc.OpenCC
)

func init() {
	var err error
	t2s, err = opencc.New("t2s")
	if err != nil {
		panic("opencc t2s init: " + err.Error())
	}
	s2t, err = opencc.New("s2t")
	if err != nil {
		panic("opencc s2t init: " + err.Error())
	}
}

func GenerateVariants(query string) []string {
	if !containsCJK(query) {
		return []string{query}
	}

	seen := make(map[string]struct{})
	var variants []string

	add := func(s string) {
		if _, ok := seen[s]; ok || s == "" {
			return
		}
		seen[s] = struct{}{}
		variants = append(variants, s)
	}

	add(query)

	if simplified, err := t2s.Convert(query); err == nil {
		add(simplified)
	}

	if traditional, err := s2t.Convert(query); err == nil {
		add(traditional)
	}

	if len(variants) > 3 {
		variants = variants[:3]
	}

	return variants
}

// ToSimplified converts Traditional Chinese to Simplified, leaving anything
// opencc cannot convert untouched. Response localization uses it so zh-CN
// clients do not get Traditional text from Traditional-Chinese data.
func ToSimplified(s string) string {
	converted, err := t2s.Convert(s)
	if err != nil {
		return s
	}
	return converted
}

func containsCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
