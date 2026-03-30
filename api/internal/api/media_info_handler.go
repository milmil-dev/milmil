package api

import (
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/storage"
)

var directPlayCodecs = map[string]bool{
	"h264": true, "avc": true, "avc1": true,
	"vp8": true, "vp9": true, "av1": true,
}
var directPlayContainers = map[string]bool{
	".mp4": true, ".webm": true, ".m4v": true,
}

type mediaInfoResponse struct {
	ID              string  `json:"id"`
	Filename        string  `json:"filename"`
	SizeBytes       int64   `json:"size_bytes"`
	Container       string  `json:"container"`
	VideoCodec      *string `json:"video_codec"`
	AudioCodec      *string `json:"audio_codec"`
	Width           *int64  `json:"width"`
	Height          *int64  `json:"height"`
	DurationSeconds *int64  `json:"duration_seconds"`
	CanDirectPlay   bool    `json:"can_direct_play"`
	NeedsTranscode  bool    `json:"needs_transcode"`
	LibraryOnline   bool    `json:"library_online"`
	LibraryType     string  `json:"library_type"`
}

func (h *handler) handleMediaInfo(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("id")

	mf, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	lib, err := h.queries.GetLibrary(ctx, mf.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	ext := strings.ToLower(filepath.Ext(mf.Path))
	codec := ""
	if mf.VideoCodec.Valid {
		codec = strings.ToLower(mf.VideoCodec.String)
	}

	canDirect := directPlayContainers[ext] && directPlayCodecs[codec]

	online := true
	if lib.SourceType == "local" || lib.SourceType == "" {
		p := storage.NewLocalProvider()
		if _, statErr := p.Stat(mf.Path); statErr != nil {
			online = false
		}
	} else {
		var configJSON string
		if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
			decrypted, decErr := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
			if decErr != nil {
				online = false
			} else {
				configJSON = decrypted
			}
		}
		if online {
			provider, provErr := storage.NewProvider(lib.SourceType, configJSON)
			if provErr != nil {
				online = false
			} else {
				defer provider.Close()
				if _, statErr := provider.Stat(mf.Path); statErr != nil {
					online = false
				}
			}
		}
	}

	return c.JSON(http.StatusOK, mediaInfoResponse{
		ID:              mf.ID,
		Filename:        mf.Filename,
		SizeBytes:       mf.SizeBytes,
		Container:       strings.TrimPrefix(ext, "."),
		VideoCodec:      nullStr(mf.VideoCodec),
		AudioCodec:      nullStr(mf.AudioCodec),
		Width:           nullInt(mf.Width),
		Height:          nullInt(mf.Height),
		DurationSeconds: nullInt(mf.DurationSeconds),
		CanDirectPlay:   canDirect && online,
		NeedsTranscode:  !canDirect,
		LibraryOnline:   online,
		LibraryType:     lib.SourceType,
	})
}
