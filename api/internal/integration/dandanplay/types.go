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

// PostCommentReq is the `/comment/{episodeId}/app` body. Comment is capped
// at 100 characters upstream; UserName is the display name the app chooses
// for the sender.
type PostCommentReq struct {
	Time     float64 `json:"time"`
	Mode     int     `json:"mode"`
	Color    int     `json:"color"`
	Comment  string  `json:"comment"`
	UserName string  `json:"userName,omitempty"`
}

// MatchRequest is one file to identify. FileHash is the MD5 of the first
// 16 MiB; FileName should carry no directory or extension.
type MatchRequest struct {
	FileName      string `json:"fileName"`
	FileHash      string `json:"fileHash"`
	FileSize      int64  `json:"fileSize"`
	VideoDuration int    `json:"videoDuration"`
	MatchMode     string `json:"matchMode"`
}

type responseBase struct {
	ErrorCode    int    `json:"errorCode"`
	ErrorMessage string `json:"errorMessage"`
}

type matchResponse struct {
	ErrorCode    int     `json:"errorCode"`
	ErrorMessage string  `json:"errorMessage"`
	IsMatched    bool    `json:"isMatched"`
	Matches      []Match `json:"matches"`
}

type batchMatchRequest struct {
	Requests []MatchRequest `json:"requests"`
}

type batchMatchItem struct {
	Success     bool   `json:"success"`
	FileHash    string `json:"fileHash"`
	MatchResult *Match `json:"matchResult"`
}

type batchMatchResponse struct {
	ErrorCode    int              `json:"errorCode"`
	ErrorMessage string           `json:"errorMessage"`
	Results      []batchMatchItem `json:"results"`
}

type commentResponse struct {
	Count    int       `json:"count"`
	Comments []Comment `json:"comments"`
}

type BangumiInfo struct {
	AnimeID    int64  `json:"animeId"`
	AnimeTitle string `json:"animeTitle"`
	BangumiID  int64  `json:"bangumiId"`
}

type bangumiInfoResponse struct {
	ErrorCode    int    `json:"errorCode"`
	ErrorMessage string `json:"errorMessage"`
	BangumiID    int64  `json:"bangumiId"`
	AnimeTitle   string `json:"animeTitle"`
}
