package tmdb

type TVShow struct {
	ID            int          `json:"id"`
	Name          string       `json:"name"`
	OriginalName  string       `json:"original_name"`
	Overview      string       `json:"overview"`
	PosterPath    string       `json:"poster_path"`
	FirstAirDate  string       `json:"first_air_date"`
	OriginCountry []string     `json:"origin_country"`
	Seasons       []SeasonInfo `json:"seasons,omitempty"`
}

// SeasonInfo is the per-season summary returned in /3/tv/{id}. Used for
// mapping Bangumi's franchise-wide absolute episode numbering to TMDB's
// per-season numbering.
type SeasonInfo struct {
	SeasonNumber int    `json:"season_number"`
	EpisodeCount int    `json:"episode_count"`
	Name         string `json:"name,omitempty"`
}

type ExternalIDs struct {
	IMDBID string `json:"imdb_id"`
	TVDBID int    `json:"tvdb_id"`
}

type Season struct {
	SeasonNumber int         `json:"season_number"`
	Episodes     []TVEpisode `json:"episodes"`
}

type TVEpisode struct {
	EpisodeNumber int    `json:"episode_number"`
	Name          string `json:"name"`
	Overview      string `json:"overview"`
	AirDate       string `json:"air_date"`
	StillPath     string `json:"still_path"`
}

type FindResult struct {
	TVResults []TVShow `json:"tv_results"`
}

type searchResponse struct {
	Results    []TVShow `json:"results"`
	TotalPages int      `json:"total_pages"`
}
