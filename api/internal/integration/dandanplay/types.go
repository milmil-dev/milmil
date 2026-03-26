// api/internal/integration/dandanplay/types.go
package dandanplay

type MatchResult struct {
	IsMatched bool    `json:"isMatched"`
	Matches   []Match `json:"matches"`
}

type Match struct {
	EpisodeID    int64   `json:"episodeId"`
	AnimeID      int64   `json:"animeId"`
	AnimeTitle   string  `json:"animeTitle"`
	EpisodeTitle string  `json:"episodeTitle"`
	Type         string  `json:"type"`
	Shift        float64 `json:"shift"`
}

type Comment struct {
	CID int64  `json:"cid"`
	P   string `json:"p"`
	M   string `json:"m"`
}

type PostCommentReq struct {
	Time    float64 `json:"time"`
	Mode    int     `json:"mode"`
	Color   int     `json:"color"`
	Comment string  `json:"comment"`
}

type matchRequest struct {
	FileName      string `json:"fileName"`
	FileHash      string `json:"fileHash"`
	FileSize      int64  `json:"fileSize"`
	VideoDuration int    `json:"videoDuration"`
	MatchMode     string `json:"matchMode"`
}

type matchResponse struct {
	ErrorCode    int     `json:"errorCode"`
	ErrorMessage string  `json:"errorMessage"`
	IsMatched    bool    `json:"isMatched"`
	Matches      []Match `json:"matches"`
}

type commentResponse struct {
	Count    int       `json:"count"`
	Comments []Comment `json:"comments"`
}
