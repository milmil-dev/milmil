package anilist

type Media struct {
	ID           int        `json:"id"`
	Title        MediaTitle `json:"title"`
	CoverImage   CoverImage `json:"coverImage"`
	BannerImage  string     `json:"bannerImage"`
	Popularity   int        `json:"popularity"`
	AverageScore int        `json:"averageScore"`
	Episodes     int        `json:"episodes"`
	Status       string     `json:"status"`
	Season       string     `json:"season"`
	SeasonYear   int        `json:"seasonYear"`
	Format       string     `json:"format"`
}

type MediaTitle struct {
	Romaji  string `json:"romaji"`
	English string `json:"english"`
	Native  string `json:"native"`
}

type CoverImage struct {
	ExtraLarge string `json:"extraLarge"`
	Large      string `json:"large"`
}
