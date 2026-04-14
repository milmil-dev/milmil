package anidb

type Source string

const (
	SourceAniDB   Source = "anidb"
	SourceMAL     Source = "mal"
	SourceAniList Source = "anilist"
	SourceKitsu   Source = "kitsu"
	SourceTMDB    Source = "tmdb"
	SourceBangumi Source = "bangumi"
)

// IDSet is the cross-site identifier set for a single anime. Zero = unknown.
type IDSet struct {
	AniDB   int64
	MAL     int64
	AniList int64
	Kitsu   int64
	TMDB    int64
	Bangumi int64
}

func (s IDSet) Get(src Source) int64 {
	switch src {
	case SourceAniDB:
		return s.AniDB
	case SourceMAL:
		return s.MAL
	case SourceAniList:
		return s.AniList
	case SourceKitsu:
		return s.Kitsu
	case SourceTMDB:
		return s.TMDB
	case SourceBangumi:
		return s.Bangumi
	}
	return 0
}

func (s *IDSet) Set(src Source, v int64) {
	switch src {
	case SourceAniDB:
		s.AniDB = v
	case SourceMAL:
		s.MAL = v
	case SourceAniList:
		s.AniList = v
	case SourceKitsu:
		s.Kitsu = v
	case SourceTMDB:
		s.TMDB = v
	case SourceBangumi:
		s.Bangumi = v
	}
}

// Merge fills any zero-valued fields in s from other. Never overwrites.
func (s *IDSet) Merge(other IDSet) {
	if s.AniDB == 0 {
		s.AniDB = other.AniDB
	}
	if s.MAL == 0 {
		s.MAL = other.MAL
	}
	if s.AniList == 0 {
		s.AniList = other.AniList
	}
	if s.Kitsu == 0 {
		s.Kitsu = other.Kitsu
	}
	if s.TMDB == 0 {
		s.TMDB = other.TMDB
	}
	if s.Bangumi == 0 {
		s.Bangumi = other.Bangumi
	}
}

// AllSources returns the canonical iteration order over sources.
func AllSources() []Source {
	return []Source{SourceAniDB, SourceMAL, SourceAniList, SourceKitsu, SourceTMDB, SourceBangumi}
}
