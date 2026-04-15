package duplicates

import (
	"sort"
	"time"
)

// RankableFile is the minimum information Rank needs to order duplicate files.
type RankableFile struct {
	ID         string
	Path       string
	SizeBytes  int64
	Resolution int
	Subgroup   string
	ModTime    time.Time
}

// Rank returns files ordered best-first. The ordering is stable so that when
// all tiebreakers are equal the input order is preserved.
//
// Criteria (in order):
//  1. Higher resolution wins.
//  2. Larger size wins.
//  3. A non-empty subgroup wins over an empty subgroup.
//  4. Newer modtime wins.
func Rank(files []RankableFile) []RankableFile {
	out := append([]RankableFile(nil), files...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Resolution != out[j].Resolution {
			return out[i].Resolution > out[j].Resolution
		}
		if out[i].SizeBytes != out[j].SizeBytes {
			return out[i].SizeBytes > out[j].SizeBytes
		}
		iHas := out[i].Subgroup != ""
		jHas := out[j].Subgroup != ""
		if iHas != jHas {
			return iHas
		}
		return out[i].ModTime.After(out[j].ModTime)
	})
	return out
}
