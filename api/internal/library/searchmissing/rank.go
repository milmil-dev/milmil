package searchmissing

import (
	"sort"

	"github.com/milmil/api/internal/matcher/fileparse"
)

// Raw is the normalized torrent search hit (fields our ranking + UI need).
type Raw struct {
	Title       string `json:"title"`
	Magnet      string `json:"magnet,omitempty"`
	TorrentURL  string `json:"torrent_url,omitempty"`
	SizeBytes   int64  `json:"size_bytes"`
	SizeDisplay string `json:"size_display,omitempty"`
	Seeders     int    `json:"seeders"`
	Leechers    int    `json:"leechers"`
	InfoHash    string `json:"info_hash,omitempty"`
	Provider    string `json:"provider"`
	PublishedAt string `json:"published_at,omitempty"`
}

// Result pairs Raw torrent data with parsed filename metadata.
type Result struct {
	Raw
	Parsed fileparse.ParsedFilename `json:"parsed"`
}

// Rank orders results best-first:
//  1. Alive torrents (Seeders > 0) before dead.
//  2. Higher resolution wins.
//  3. More seeders.
//  4. Bigger size at same resolution.
//  5. Known subgroup beats anonymous.
//
// Stable on complete tie.
func Rank(rs []Result) []Result {
	out := append([]Result(nil), rs...)
	sort.SliceStable(out, func(i, j int) bool {
		iDead := out[i].Seeders == 0
		jDead := out[j].Seeders == 0
		if iDead != jDead {
			return !iDead
		}
		if out[i].Parsed.Resolution != out[j].Parsed.Resolution {
			return out[i].Parsed.Resolution > out[j].Parsed.Resolution
		}
		if out[i].Seeders != out[j].Seeders {
			return out[i].Seeders > out[j].Seeders
		}
		if out[i].SizeBytes != out[j].SizeBytes {
			return out[i].SizeBytes > out[j].SizeBytes
		}
		iSub := out[i].Parsed.SubGroup != ""
		jSub := out[j].Parsed.SubGroup != ""
		if iSub != jSub {
			return iSub
		}
		return false
	})
	return out
}
