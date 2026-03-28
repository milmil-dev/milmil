package metadata

type AnimeSummary struct {
	BangumiID     int      `json:"bangumi_id"`
	AniListID     int      `json:"anilist_id,omitempty"`
	Title         string   `json:"title"`
	TitleOriginal string   `json:"title_original"`
	TitleEN       string   `json:"title_en,omitempty"`
	CoverImage    string   `json:"cover_image"`
	BannerImage   string   `json:"banner_image,omitempty"`
	Description   string   `json:"description,omitempty"`
	Genres        []string `json:"genres,omitempty"`
	AirDate       string   `json:"air_date,omitempty"`
	EpisodeCount  int      `json:"episode_count"`
	Score         float64  `json:"score"`
	NextEpisode   int      `json:"next_episode,omitempty"`
}

type AnimeDetail struct {
	AnimeSummary
	Synopsis        string         `json:"synopsis"`
	BannerImage     string         `json:"banner_image,omitempty"`
	TrailerURL      string         `json:"trailer_url,omitempty"`
	Tags            []string       `json:"tags"`
	Popularity      int            `json:"popularity,omitempty"`
	Rating          Rating         `json:"rating"`
	Relations       []RelatedAnime `json:"relations,omitempty"`
	Recommendations []AnimeSummary `json:"recommendations,omitempty"`
	Reviews         []UserReview   `json:"reviews,omitempty"`
}

type RelatedAnime struct {
	RelationType string       `json:"relation_type"` // PREQUEL, SEQUEL, SIDE_STORY, etc.
	Anime        AnimeSummary `json:"anime"`
}

type CalendarDay struct {
	Weekday   string         `json:"weekday"`
	WeekdayEN string         `json:"weekday_en"`
	Items     []AnimeSummary `json:"items"`
}

type Episode struct {
	BangumiEpisodeID int     `json:"bangumi_episode_id"`
	Sort             float64 `json:"sort"`
	Title            string  `json:"title"`
	TitleOriginal    string  `json:"title_original"`
	AirDate          string  `json:"air_date,omitempty"`
	Synopsis         string  `json:"synopsis,omitempty"`
	Image            string  `json:"image,omitempty"`
	Duration         int     `json:"duration,omitempty"` // minutes
}

type Rating struct {
	Score float64 `json:"score"`
	Total int     `json:"total"`
}

type UserReview struct {
	ID       int    `json:"id"`
	Summary  string `json:"summary"`
	Score    int    `json:"score"`
	Username string `json:"username"`
	Avatar   string `json:"avatar,omitempty"`
}
