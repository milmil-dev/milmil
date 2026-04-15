package completeness

import "time"

// Report captures missing-episode state for a single anime.
type Report struct {
	AnimeID       string    `json:"anime_id"`
	BangumiID     int64     `json:"bangumi_id,omitempty"`
	Title         string    `json:"title,omitempty"`
	Total         int       `json:"total"`
	Have          []int     `json:"have"`
	Missing       []int     `json:"missing"`
	AiringPending []int     `json:"airing_pending"`
	UnknownTotal  bool      `json:"unknown_total"`
	GeneratedAt   time.Time `json:"generated_at"`
}

// MissingCount returns the number of missing episodes.
func (r Report) MissingCount() int { return len(r.Missing) }

// IsComplete reports whether the anime has every known episode present with
// no pending future airings.
func (r Report) IsComplete() bool {
	return r.Total > 0 && len(r.Missing) == 0 && len(r.AiringPending) == 0
}
