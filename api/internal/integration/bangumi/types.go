package bangumi

type Subject struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	NameCN  string  `json:"name_cn"`
	Summary string  `json:"summary"`
	Images  Images  `json:"images"`
	AirDate string  `json:"date"`
	Eps     int     `json:"eps"`
	Tags    []Tag   `json:"tags"`
	Rating  Rating  `json:"rating"`
}

type Images struct {
	Large  string `json:"large"`
	Common string `json:"common"`
	Medium string `json:"medium"`
	Small  string `json:"small"`
	Grid   string `json:"grid"`
}

type Tag struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type Rating struct {
	Score float64 `json:"score"`
	Total int     `json:"total"`
}

type Episode struct {
	ID      int     `json:"id"`
	Sort    float64 `json:"sort"`
	Name    string  `json:"name"`
	NameCN  string  `json:"name_cn"`
	AirDate string  `json:"airdate"`
	Desc    string  `json:"desc"`
}

type CalendarDay struct {
	Weekday Weekday   `json:"weekday"`
	Items   []Subject `json:"items"`
}

type Weekday struct {
	EN string `json:"en"`
	CN string `json:"cn"`
	JA string `json:"ja"`
	ID int    `json:"id"`
}

type SearchResult struct {
	Data  []Subject `json:"data"`
	Total int       `json:"total"`
}

type EpisodeList struct {
	Data  []Episode `json:"data"`
	Total int       `json:"total"`
}

type SubjectComment struct {
	ID        int         `json:"id"`
	User      CommentUser `json:"user"`
	Rate      int         `json:"rate"`
	Comment   string      `json:"comment"`
	UpdatedAt int64       `json:"updatedAt"`
}

type CommentUser struct {
	ID       int          `json:"id"`
	Username string       `json:"username"`
	Nickname string       `json:"nickname"`
	Avatar   CommentAvatar `json:"avatar"`
}

type CommentAvatar struct {
	Small  string `json:"small"`
	Medium string `json:"medium"`
	Large  string `json:"large"`
}

type CommentList struct {
	Data  []SubjectComment `json:"data"`
	Total int              `json:"total"`
}
