package anilist

type Media struct {
	ID              int                  `json:"id"`
	Title           MediaTitle           `json:"title"`
	Description     string               `json:"description"`
	CoverImage      CoverImage           `json:"coverImage"`
	BannerImage     string               `json:"bannerImage"`
	Trailer         *MediaTrailer        `json:"trailer,omitempty"`
	Popularity      int                  `json:"popularity"`
	AverageScore    int                  `json:"averageScore"`
	Episodes        int                  `json:"episodes"`
	Status          string               `json:"status"`
	Season          string               `json:"season"`
	SeasonYear      int                  `json:"seasonYear"`
	Format          string               `json:"format"`
	Genres          []string             `json:"genres"`
	Relations       *MediaConnection     `json:"relations,omitempty"`
	Recommendations *RecConnection       `json:"recommendations,omitempty"`
	Reviews         *ReviewConnection    `json:"reviews,omitempty"`
	Characters      *CharacterConnection `json:"characters,omitempty"`
}

// Character types

type CharacterName struct {
	Full   string `json:"full"`
	Native string `json:"native"`
}

type CharacterImage struct {
	Medium string `json:"medium"`
}

type Character struct {
	ID    int            `json:"id"`
	Name  CharacterName  `json:"name"`
	Image CharacterImage `json:"image"`
}

type StaffName struct {
	Full   string `json:"full"`
	Native string `json:"native"`
}

type StaffImage struct {
	Medium string `json:"medium"`
}

type Staff struct {
	ID    int        `json:"id"`
	Name  StaffName  `json:"name"`
	Image StaffImage `json:"image"`
}

type CharacterEdge struct {
	Role        string    `json:"role"`
	Node        Character `json:"node"`
	VoiceActors []Staff   `json:"voiceActors"`
}

type CharacterConnection struct {
	Edges []CharacterEdge `json:"edges"`
}

type MediaTrailer struct {
	ID   string `json:"id"`
	Site string `json:"site"`
}

type MediaEdge struct {
	RelationType string `json:"relationType"`
	Node         Media  `json:"node"`
}

type MediaConnection struct {
	Edges []MediaEdge `json:"edges"`
}

type RecNode struct {
	MediaRecommendation *Media `json:"mediaRecommendation"`
}

type RecConnection struct {
	Nodes []RecNode `json:"nodes"`
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

type Review struct {
	ID           int        `json:"id"`
	Summary      string     `json:"summary"`
	Score        int        `json:"score"`
	Rating       int        `json:"rating"`
	RatingAmount int        `json:"ratingAmount"`
	User         ReviewUser `json:"user"`
}

type ReviewUser struct {
	Name   string     `json:"name"`
	Avatar UserAvatar `json:"avatar"`
}

type UserAvatar struct {
	Medium string `json:"medium"`
}

type ReviewConnection struct {
	Nodes []Review `json:"nodes"`
}
