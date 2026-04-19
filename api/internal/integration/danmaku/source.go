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

type Source interface {
	Name() string
	Search(ctx context.Context, keyword string, page int) ([]SearchResult, error)
	FetchDanmaku(ctx context.Context, videoID string) ([]Comment, error)
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
