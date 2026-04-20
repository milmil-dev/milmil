package danmaku

import "context"

type SearchResult struct {
	VideoID      string `json:"videoId"`
	Title        string `json:"title"`
	DanmakuCount int    `json:"danmakuCount"`
	Duration     string `json:"duration"`
	Thumbnail    string `json:"thumbnail,omitempty"`
}

type Comment struct {
	Text  string  `json:"text"`
	Time  float64 `json:"time"`
	Mode  string  `json:"mode"`
	Color string  `json:"color"`
}

// VideoPart represents a sub-page/part of a video (e.g., Bilibili 分P).
type VideoPart struct {
	Index    int    `json:"index"`    // 0-based part index
	Title    string `json:"title"`    // part title
	Duration int    `json:"duration"` // seconds
}

type Source interface {
	Name() string
	Search(ctx context.Context, keyword string, page int) ([]SearchResult, error)
	// GetParts returns the list of parts for a video. Single-part videos return a slice of length 1.
	GetParts(ctx context.Context, videoID string) ([]VideoPart, error)
	// FetchDanmaku fetches danmaku for a specific part of a video (0-based index).
	FetchDanmaku(ctx context.Context, videoID string, partIndex int) ([]Comment, error)
}

type Registry struct {
	sources map[string]Source
}

func NewRegistry() *Registry {
	return &Registry{sources: make(map[string]Source)}
}

func (r *Registry) Register(s Source) {
	r.sources[s.Name()] = s
}

func (r *Registry) Get(name string) (Source, bool) {
	s, ok := r.sources[name]
	return s, ok
}

func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.sources))
	for name := range r.sources {
		names = append(names, name)
	}
	return names
}
