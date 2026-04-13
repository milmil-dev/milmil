package jellyfin

// ServerInfo is returned by /System/Info/Public and /System/Info.
type ServerInfo struct {
	LocalAddress           string `json:"LocalAddress"`
	ServerName             string `json:"ServerName"`
	Version                string `json:"Version"`
	ID                     string `json:"Id"`
	OperatingSystem        string `json:"OperatingSystem,omitempty"`
	HasPendingRestart      bool   `json:"HasPendingRestart"`
	SupportsLibraryMonitor bool   `json:"SupportsLibraryMonitor"`
	ProductName            string `json:"ProductName"`
	StartupWizardCompleted bool   `json:"StartupWizardCompleted"`
}

// AuthResponse is returned by /Users/AuthenticateByName.
type AuthResponse struct {
	User        UserDTO `json:"User"`
	AccessToken string  `json:"AccessToken"`
	ServerID    string  `json:"ServerId"`
}

// UserDTO represents a Jellyfin user.
type UserDTO struct {
	Name                  string `json:"Name"`
	ServerID              string `json:"ServerId"`
	ID                    string `json:"Id"`
	HasPassword           bool   `json:"HasPassword"`
	HasConfiguredPassword bool   `json:"HasConfiguredPassword"`
}

// ItemDTO represents any Jellyfin library item (series, episode, folder).
type ItemDTO struct {
	Name              string            `json:"Name"`
	ServerID          string            `json:"ServerId"`
	ID                string            `json:"Id"`
	Type              string            `json:"Type"`
	Overview          string            `json:"Overview,omitempty"`
	ParentID          string            `json:"ParentId,omitempty"`
	IndexNumber       *int              `json:"IndexNumber,omitempty"`
	ImageTags         map[string]string `json:"ImageTags,omitempty"`
	UserData          *UserItemData     `json:"UserData,omitempty"`
	MediaSources      []MediaSource     `json:"MediaSources,omitempty"`
	PremiereDate      string            `json:"PremiereDate,omitempty"`
	CommunityRating   *float64          `json:"CommunityRating,omitempty"`
	ProductionYear    *int              `json:"ProductionYear,omitempty"`
	Genres            []string          `json:"Genres,omitempty"`
	RunTimeTicks      *int64            `json:"RunTimeTicks,omitempty"`
	CollectionType    string            `json:"CollectionType,omitempty"`
	ChildCount        *int              `json:"ChildCount,omitempty"`
	MediaType         string            `json:"MediaType,omitempty"`
	LocationType      string            `json:"LocationType,omitempty"`
	IsFolder          bool              `json:"IsFolder,omitempty"`
	ParentIndexNumber *int              `json:"ParentIndexNumber,omitempty"`
	SeriesID          string            `json:"SeriesId,omitempty"`
	SeriesName        string            `json:"SeriesName,omitempty"`
	SeasonID          string            `json:"SeasonId,omitempty"`
	SeasonName        string            `json:"SeasonName,omitempty"`
}

// ItemsResponse wraps a list of items with total count.
type ItemsResponse struct {
	Items            []ItemDTO `json:"Items"`
	TotalRecordCount int       `json:"TotalRecordCount"`
	StartIndex       int       `json:"StartIndex"`
}

// MediaSource describes a playable media file.
type MediaSource struct {
	ID                   string        `json:"Id"`
	Path                 string        `json:"Path"`
	Container            string        `json:"Container"`
	Size                 int64         `json:"Size"`
	Name                 string        `json:"Name"`
	RunTimeTicks         *int64        `json:"RunTimeTicks,omitempty"`
	Protocol             string        `json:"Protocol"`
	Type                 string        `json:"Type"`
	IsRemote             bool          `json:"IsRemote"`
	IsInfiniteStream     bool          `json:"IsInfiniteStream"`
	Bitrate              int           `json:"Bitrate,omitempty"`
	SupportsDirectPlay   bool          `json:"SupportsDirectPlay"`
	SupportsDirectStream bool          `json:"SupportsDirectStream"`
	SupportsTranscoding  bool          `json:"SupportsTranscoding"`
	SupportsProbing      bool          `json:"SupportsProbing"`
	VideoType            string        `json:"VideoType"`
	MediaStreams          []MediaStream `json:"MediaStreams"`
	DirectStreamURL      string        `json:"DirectStreamUrl,omitempty"`
	TranscodingURL       string        `json:"TranscodingUrl,omitempty"`
}

// MediaStream describes a single video, audio, or subtitle track.
type MediaStream struct {
	Codec        string `json:"Codec"`
	Type         string `json:"Type"`
	Index        int    `json:"Index"`
	Language     string `json:"Language,omitempty"`
	DisplayTitle string `json:"DisplayTitle,omitempty"`
	Width        int    `json:"Width,omitempty"`
	Height       int    `json:"Height,omitempty"`
	BitRate      int    `json:"BitRate,omitempty"`
	IsDefault    bool   `json:"IsDefault,omitempty"`
	IsExternal   bool   `json:"IsExternal,omitempty"`
}

// UserItemData holds watch progress and played status.
type UserItemData struct {
	PlaybackPositionTicks int64  `json:"PlaybackPositionTicks"`
	PlayCount             int    `json:"PlayCount"`
	IsFavorite            bool   `json:"IsFavorite"`
	Played                bool   `json:"Played"`
	Key                   string `json:"Key"`
}

// PlaybackInfoResponse is returned by /Items/{id}/PlaybackInfo.
type PlaybackInfoResponse struct {
	MediaSources  []MediaSource `json:"MediaSources"`
	PlaySessionID string        `json:"PlaySessionId"`
}

// PlaybackStartRequest is sent to /Sessions/Playing.
type PlaybackStartRequest struct {
	ItemID        string `json:"ItemId"`
	MediaSourceID string `json:"MediaSourceId"`
	PlaySessionID string `json:"PlaySessionId"`
	CanSeek       bool   `json:"CanSeek"`
	PlayMethod    string `json:"PlayMethod"`
}

// PlaybackProgressRequest is sent to /Sessions/Playing/Progress.
type PlaybackProgressRequest struct {
	ItemID        string `json:"ItemId"`
	MediaSourceID string `json:"MediaSourceId"`
	PlaySessionID string `json:"PlaySessionId"`
	PositionTicks int64  `json:"PositionTicks"`
	IsPaused      bool   `json:"IsPaused"`
	PlayMethod    string `json:"PlayMethod"`
}

// PlaybackStopRequest is sent to /Sessions/Playing/Stopped.
type PlaybackStopRequest struct {
	ItemID        string `json:"ItemId"`
	MediaSourceID string `json:"MediaSourceId"`
	PlaySessionID string `json:"PlaySessionId"`
	PositionTicks int64  `json:"PositionTicks"`
}

// JellyfinError is the standard Jellyfin error response format.
type JellyfinError struct {
	Message string `json:"Message"`
}

// ViewsResponse wraps user views (home screen folders).
type ViewsResponse struct {
	Items            []ItemDTO `json:"Items"`
	TotalRecordCount int       `json:"TotalRecordCount"`
}

// DiscoveryResponse is the JSON payload for UDP server discovery on port 7359.
type DiscoveryResponse struct {
	Address string `json:"Address"`
	ID      string `json:"Id"`
	Name    string `json:"Name"`
}
