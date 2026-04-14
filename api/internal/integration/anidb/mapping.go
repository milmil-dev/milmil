package anidb

import (
	"encoding/json"
	"encoding/xml"
	"regexp"
	"strconv"
)

// Mapping is an in-memory cross-site ID index built from one or more sources.
type Mapping struct {
	bySource map[Source]map[int64]IDSet
}

var sourceURLPatterns = []struct {
	src Source
	re  *regexp.Regexp
}{
	{SourceAniDB, regexp.MustCompile(`anidb\.net/anime/(\d+)`)},
	{SourceMAL, regexp.MustCompile(`myanimelist\.net/anime/(\d+)`)},
	{SourceAniList, regexp.MustCompile(`anilist\.co/anime/(\d+)`)},
	{SourceKitsu, regexp.MustCompile(`kitsu\.(?:io|app)/anime/(\d+)`)},
	{SourceTMDB, regexp.MustCompile(`themoviedb\.org/(?:tv|movie)/(\d+)`)},
}

type manamiDoc struct {
	Data []struct {
		Sources []string `json:"sources"`
	} `json:"data"`
}

// LoadMapping parses a Manami anime-offline-database JSON blob.
func LoadMapping(raw []byte) (*Mapping, error) {
	var doc manamiDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	m := newMapping()
	for _, entry := range doc.Data {
		var set IDSet
		for _, url := range entry.Sources {
			for _, sp := range sourceURLPatterns {
				if mm := sp.re.FindStringSubmatch(url); mm != nil {
					if id, err := strconv.ParseInt(mm[1], 10, 64); err == nil {
						set.Set(sp.src, id)
					}
				}
			}
		}
		m.indexSet(set)
	}
	return m, nil
}

type animeListsDoc struct {
	Anime []struct {
		AnidbID   int64 `xml:"anidbid,attr"`
		BangumiID int64 `xml:"bangumiid"`
	} `xml:"anime"`
}

// LoadAnimeListsMapping parses the anime-lists XML and returns AniDB↔Bangumi pairs.
// Entries lacking either ID are dropped.
func LoadAnimeListsMapping(raw []byte) ([]IDSet, error) {
	var doc animeListsDoc
	if err := xml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	out := make([]IDSet, 0, len(doc.Anime))
	for _, a := range doc.Anime {
		if a.AnidbID == 0 || a.BangumiID == 0 {
			continue
		}
		out = append(out, IDSet{AniDB: a.AnidbID, Bangumi: a.BangumiID})
	}
	return out, nil
}

// MergeIDSets folds extra ID pairs into an existing Mapping. For each pair, it
// finds the existing IDSet for any known source on the pair, unions the new
// fields in, then re-indexes under every non-zero source on the merged set.
func (m *Mapping) MergeIDSets(extras []IDSet) {
	for _, ex := range extras {
		merged := ex
		for _, src := range AllSources() {
			if id := ex.Get(src); id != 0 {
				if existing, ok := m.lookup(src, id); ok {
					merged.Merge(existing)
					break // existing already covers what's known; keep merging from ex itself
				}
			}
		}
		m.indexSet(merged)
	}
}

// Resolve returns the full IDSet for (source, id).
func (m *Mapping) Resolve(src Source, id int64) (IDSet, bool) {
	if m == nil {
		return IDSet{}, false
	}
	return m.lookup(src, id)
}

func (m *Mapping) lookup(src Source, id int64) (IDSet, bool) {
	bucket, ok := m.bySource[src]
	if !ok {
		return IDSet{}, false
	}
	set, ok := bucket[id]
	return set, ok
}

func (m *Mapping) indexSet(set IDSet) {
	for _, src := range AllSources() {
		if id := set.Get(src); id != 0 {
			bucket, ok := m.bySource[src]
			if !ok {
				bucket = make(map[int64]IDSet)
				m.bySource[src] = bucket
			}
			// If an existing entry exists for this (src,id), union the two.
			if prev, ok := bucket[id]; ok {
				prev.Merge(set)
				bucket[id] = prev
			} else {
				bucket[id] = set
			}
		}
	}
}

func newMapping() *Mapping {
	m := &Mapping{bySource: make(map[Source]map[int64]IDSet, len(AllSources()))}
	return m
}
