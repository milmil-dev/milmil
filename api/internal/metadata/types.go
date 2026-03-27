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
}

type AnimeDetail struct {
	AnimeSummary
	Synopsis    string   `json:"synopsis"`
	BannerImage string   `json:"banner_image,omitempty"`
	Tags        []string `json:"tags"`
	Popularity  int      `json:"popularity,omitempty"`
	Rating      Rating   `json:"rating"`
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
}

type Rating struct {
	Score float64 `json:"score"`
	Total int     `json:"total"`
}
