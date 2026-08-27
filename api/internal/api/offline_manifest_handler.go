package api

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

// Offline manifest — everything a client needs to keep a series on its own
// disk: one playable file per episode with a cache-busting etag, the sidecar
// subtitles the subtitle endpoints already expose, and the danmaku URL.
type offlineManifest struct {
	BangumiID int64                    `json:"bangumi_id"`
	Title     string                   `json:"title"`
	Episodes  []offlineManifestEpisode `json:"episodes"`
}

type offlineManifestEpisode struct {
	EpisodeID  string                    `json:"episode_id"`
	Number     float64                   `json:"number"`
	Title      string                    `json:"title"`
	File       offlineManifestFile       `json:"file"`
	Subtitles  []offlineManifestSubtitle `json:"subtitles"`
	DanmakuURL *string                   `json:"danmaku_url"`
}

type offlineManifestFile struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	SizeBytes  int64  `json:"size_bytes"`
	ETag       string `json:"etag"`
	Container  string `json:"container"`
	Width      int64  `json:"width"`
	Height     int64  `json:"height"`
	VideoCodec string `json:"video_codec"`
}

type offlineManifestSubtitle struct {
	Index    int    `json:"index"`
	Language string `json:"language"`
	Title    string `json:"title"`
	URL      string `json:"url"`
}

func (h *handler) handleOfflineManifest(c *echo.Context) error {
	ctx := c.Request().Context()
	bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}
	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	episodes, err := h.queries.ListEpisodesByAnimeID(ctx, anime.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	manifest := offlineManifest{
		BangumiID: bangumiID,
		Title:     preferredTitle(anime.TitleZh, anime.Title),
		Episodes:  make([]offlineManifestEpisode, 0, len(episodes)),
	}
	for _, ep := range episodes {
		files, err := h.queries.ListMediaFilesByEpisode(ctx, sql.NullString{String: ep.ID, Valid: true})
		if err != nil || len(files) == 0 {
			continue
		}
		file := files[0]
		if ep.PreferredMediaFileID.Valid {
			for _, f := range files {
				if f.ID == ep.PreferredMediaFileID.String {
					file = f
					break
				}
			}
		}
		subs, _ := h.queries.ListSubtitlesByMediaFile(ctx, file.ID)
		manifestSubs := make([]offlineManifestSubtitle, 0, len(subs))
		for i, sub := range subs {
			manifestSubs = append(manifestSubs, offlineManifestSubtitle{
				Index:    i,
				Language: sub.Language,
				Title:    subtitleTitle(sub),
				URL:      "/api/v1/subtitles/" + sub.ID + "/content",
			})
		}
		danmakuURL := "/api/v1/danmaku/" + file.ID
		manifest.Episodes = append(manifest.Episodes, offlineManifestEpisode{
			EpisodeID:  ep.ID,
			Number:     ep.EpisodeNumber,
			Title:      preferredTitle(ep.TitleZh, ep.Title.String),
			File:       manifestFile(file),
			Subtitles:  manifestSubs,
			DanmakuURL: &danmakuURL,
		})
	}
	return c.JSON(http.StatusOK, manifest)
}

func preferredTitle(zh sql.NullString, fallback string) string {
	if zh.Valid && zh.String != "" {
		return zh.String
	}
	return fallback
}

func subtitleTitle(sub store.SubtitleFile) string {
	name := strings.TrimSuffix(filepath.Base(sub.Path), filepath.Ext(sub.Path))
	if sub.Source != "" {
		return fmt.Sprintf("%s (%s)", name, sub.Source)
	}
	return name
}

func manifestFile(file store.MediaFile) offlineManifestFile {
	return offlineManifestFile{
		ID:         file.ID,
		URL:        "/api/v1/stream/" + file.ID + "/direct",
		SizeBytes:  file.SizeBytes,
		ETag:       mediaFileETag(file),
		Container:  strings.TrimPrefix(strings.ToLower(filepath.Ext(file.Path)), "."),
		Width:      file.Width.Int64,
		Height:     file.Height.Int64,
		VideoCodec: file.VideoCodec.String,
	}
}

// mediaFileETag changes whenever the file on disk does: path + size + mtime
// (the DB's updated_at when the file is not locally reachable).
func mediaFileETag(file store.MediaFile) string {
	stamp := file.UpdatedAt
	if info, err := os.Stat(file.Path); err == nil {
		stamp = strconv.FormatInt(info.ModTime().Unix(), 10)
	}
	sum := sha256.Sum256([]byte(file.Path + "|" + strconv.FormatInt(file.SizeBytes, 10) + "|" + stamp))
	return hex.EncodeToString(sum[:8])
}

// streamETag is the same identity for the direct stream response headers.
func streamETag(file store.MediaFile) string {
	return `"` + mediaFileETag(file) + `"`
}
