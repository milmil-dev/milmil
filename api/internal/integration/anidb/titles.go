package anidb

import (
	"encoding/xml"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

type Candidate struct {
	AniDBID int64
	Title   string
	Score   float64
}

type titleEntry struct {
	aid        int64
	normalized string
	raw        string
}

type TitleIndex struct {
	entries  []titleEntry
	ngramIdx map[string][]int
}

const ngramSize = 3

type titlesXMLDoc struct {
	Anime []struct {
		Aid    int64 `xml:"aid,attr"`
		Titles []struct {
			Value string `xml:",chardata"`
		} `xml:"title"`
	} `xml:"anime"`
}

// LoadTitleIndex parses an anime-titles.xml document.
func LoadTitleIndex(raw []byte) (*TitleIndex, error) {
	var doc titlesXMLDoc
	if err := xml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	idx := &TitleIndex{}
	for _, a := range doc.Anime {
		for _, t := range a.Titles {
			normed := normalizeTitle(t.Value)
			if normed == "" {
				continue
			}
			idx.entries = append(idx.entries, titleEntry{
				aid:        a.Aid,
				normalized: normed,
				raw:        strings.TrimSpace(t.Value),
			})
		}
	}
	idx.ngramIdx = make(map[string][]int, len(idx.entries))
	for i, e := range idx.entries {
		for _, g := range ngrams(e.normalized) {
			idx.ngramIdx[g] = append(idx.ngramIdx[g], i)
		}
	}
	return idx, nil
}

func normalizeTitle(s string) string {
	s = norm.NFKC.String(s)
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func ngrams(s string) []string {
	rs := []rune(s)
	if len(rs) < ngramSize {
		return nil
	}
	out := make([]string, 0, len(rs)-ngramSize+1)
	seen := make(map[string]struct{}, len(rs))
	for i := 0; i+ngramSize <= len(rs); i++ {
		g := string(rs[i : i+ngramSize])
		if _, ok := seen[g]; ok {
			continue
		}
		seen[g] = struct{}{}
		out = append(out, g)
	}
	return out
}

// Search returns candidates ranked by similarity score descending. year is
// reserved for future disambiguation; currently ignored.
func (idx *TitleIndex) Search(query string, year int) []Candidate {
	if idx == nil {
		return nil
	}
	q := normalizeTitle(query)
	if q == "" {
		return nil
	}

	var candidateSet map[int]struct{}
	grams := ngrams(q)
	if len(grams) == 0 {
		// Very short query — fall back to scanning all entries.
		candidateSet = make(map[int]struct{}, len(idx.entries))
		for i := range idx.entries {
			candidateSet[i] = struct{}{}
		}
	} else {
		candidateSet = make(map[int]struct{}, 256)
		for _, g := range grams {
			for _, i := range idx.ngramIdx[g] {
				candidateSet[i] = struct{}{}
			}
		}
	}

	qRunes := []rune(q)
	best := make(map[int64]Candidate, 16)
	for i := range candidateSet {
		e := idx.entries[i]
		lcs := longestCommonSubstring(q, e.normalized)
		if lcs == 0 {
			continue
		}
		score := similarityFromLCS(lcs, qRunes, []rune(e.normalized))
		// Accept either a strong overall similarity or full query containment
		// (query appears as a substring of the title).
		if score < 0.5 && lcs < len(qRunes) {
			continue
		}
		if existing, ok := best[e.aid]; ok && existing.Score >= score {
			continue
		}
		best[e.aid] = Candidate{AniDBID: e.aid, Title: e.raw, Score: score}
	}

	out := make([]Candidate, 0, len(best))
	for _, c := range best {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// similarityFromLCS returns a score in [0,1] computed from a precomputed LCS
// length. 1.0 means equal after normalization.
func similarityFromLCS(lcs int, a, b []rune) float64 {
	maxLen := max(len(b), len(a))
	if maxLen == 0 {
		return 0
	}
	return float64(lcs) / float64(maxLen)
}

func longestCommonSubstring(a, b string) int {
	ar, br := []rune(a), []rune(b)
	if len(ar) == 0 || len(br) == 0 {
		return 0
	}
	prev := make([]int, len(br)+1)
	curr := make([]int, len(br)+1)
	best := 0
	for i := 1; i <= len(ar); i++ {
		for j := 1; j <= len(br); j++ {
			if ar[i-1] == br[j-1] {
				curr[j] = prev[j-1] + 1
				if curr[j] > best {
					best = curr[j]
				}
			} else {
				curr[j] = 0
			}
		}
		prev, curr = curr, prev
	}
	return best
}
