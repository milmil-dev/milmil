package jellyfin

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handlePlaybackInfo(c echo.Context) error {
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
func (h *Handler) getMediaSourcesForEpisode(c echo.Context, episodeID string) []MediaSource {
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
	container := "mkv"
	if f.ContainerFormat.Valid {
		container = f.ContainerFormat.String
	}

	var streams []MediaStream
	if f.VideoCodec.Valid {
		ms := MediaStream{Codec: f.VideoCodec.String, Type: "Video", Index: 0}
		if f.Width.Valid {
			ms.Width = int(f.Width.Int64)
		}
		if f.Height.Valid {
			ms.Height = int(f.Height.Int64)
		}
		streams = append(streams, ms)
	}
	if f.AudioCodec.Valid {
		streams = append(streams, MediaStream{Codec: f.AudioCodec.String, Type: "Audio", Index: 1, IsDefault: true})
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
		SupportsDirectPlay:   true,
		SupportsDirectStream: true,
		SupportsTranscoding:  true,
		VideoType:            "VideoFile",
		MediaStreams:          streams,
	}
}
