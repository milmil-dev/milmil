package jellyfin

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handlePlaybackInfo(c *echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var sources []MediaSource

	switch typ {
	case "episode":
		sources = h.getMediaSourcesForEpisode(c, id)
	case "file":
		mf, err := h.queries.GetMediaFileByID(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		sources = []MediaSource{h.mediaFileToSource(mf)}
	case "anime":
		eps, err := h.queries.ListEpisodesByAnimeID(ctx, id)
		if err != nil || len(eps) == 0 {
			return c.JSON(http.StatusOK, PlaybackInfoResponse{MediaSources: []MediaSource{}})
		}
		sources = h.getMediaSourcesForEpisode(c, eps[0].ID)
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	for i := range sources {
		sources[i].DirectStreamURL = "/jellyfin/Videos/" + itemIDEncoded + "/stream"
		sources[i].TranscodingURL = "/jellyfin/Videos/" + itemIDEncoded + "/master.m3u8"
	}

	return c.JSON(http.StatusOK, PlaybackInfoResponse{
		MediaSources:  sources,
		PlaySessionID: uuid.NewString(),
	})
}

// getMediaSourcesForEpisode returns media sources for an episode by looking up its playable files.
func (h *Handler) getMediaSourcesForEpisode(c *echo.Context, episodeID string) []MediaSource {
	files, err := h.queries.ListMediaFilesByEpisodeID(c.Request().Context(), episodeID)
	if err != nil {
		return nil
	}
	sources := make([]MediaSource, 0, len(files))
	for _, f := range files {
		sources = append(sources, h.mediaFileToSource(f))
	}
	return sources
}

// mediaFileToSource converts a milmil MediaFile to a Jellyfin MediaSource.
func (h *Handler) mediaFileToSource(f store.MediaFile) MediaSource {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(f.Filename)), ".")
	container := ext
	if container == "" {
		container = "mkv"
	}
	if f.ContainerFormat.Valid && f.ContainerFormat.String != "" {
		container = f.ContainerFormat.String
	}

	streams := make([]MediaStream, 0)

	// Use DB codec info if available, otherwise infer from filename
	videoCodec := ""
	audioCodec := ""
	width, height := 0, 0

	if f.VideoCodec.Valid && f.VideoCodec.String != "" {
		videoCodec = f.VideoCodec.String
	} else {
		// Infer from filename
		nameLower := strings.ToLower(f.Filename)
		if strings.Contains(nameLower, "hevc") || strings.Contains(nameLower, "x265") || strings.Contains(nameLower, "h265") {
			videoCodec = "hevc"
		} else if strings.Contains(nameLower, "h264") || strings.Contains(nameLower, "x264") || strings.Contains(nameLower, "avc") {
			videoCodec = "h264"
		}
	}
	if f.AudioCodec.Valid && f.AudioCodec.String != "" {
		audioCodec = f.AudioCodec.String
	} else {
		nameLower := strings.ToLower(f.Filename)
		if strings.Contains(nameLower, "flac") {
			audioCodec = "flac"
		} else if strings.Contains(nameLower, "aac") {
			audioCodec = "aac"
		}
	}
	if f.Width.Valid {
		width = int(f.Width.Int64)
	}
	if f.Height.Valid {
		height = int(f.Height.Int64)
	}
	// Infer resolution from filename if not in DB
	if width == 0 {
		nameLower := strings.ToLower(f.Filename)
		if strings.Contains(nameLower, "1920x1080") || strings.Contains(nameLower, "1080p") {
			width, height = 1920, 1080
		} else if strings.Contains(nameLower, "1280x720") || strings.Contains(nameLower, "720p") {
			width, height = 1280, 720
		}
	}

	// Fallback: if no codec detected, assume h264+aac (most common)
	if videoCodec == "" {
		videoCodec = "h264"
	}
	if audioCodec == "" {
		audioCodec = "aac"
	}

	if videoCodec != "" {
		streams = append(streams, MediaStream{
			Codec: videoCodec, Type: "Video", Index: 0,
			Width: width, Height: height, IsDefault: true,
		})
	}
	if audioCodec != "" {
		streams = append(streams, MediaStream{
			Codec: audioCodec, Type: "Audio", Index: 1, IsDefault: true,
		})
	}

	var runtimeTicks *int64
	if f.DurationSeconds.Valid {
		ticks := f.DurationSeconds.Int64 * 10_000_000
		runtimeTicks = &ticks
	}

	fileItemID := EncodeItemID("file", f.ID)
	return MediaSource{
		ID:                   fileItemID,
		Path:                 f.Path,
		Container:            container,
		Size:                 f.SizeBytes,
		Name:                 f.Filename,
		RunTimeTicks:         runtimeTicks,
		Protocol:             "File",
		Type:                 "Default",
		IsRemote:             false,
		SupportsDirectPlay:   true,
		SupportsDirectStream: true,
		SupportsTranscoding:  true,
		SupportsProbing:      true,
		VideoType:            "VideoFile",
		MediaStreams:          streams,
	}
}
