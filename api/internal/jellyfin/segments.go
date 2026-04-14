package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

// MediaSegmentItem is a single Jellyfin media segment (intro, outro, recap).
type MediaSegmentItem struct {
	ID       string `json:"Id"`
	ItemID   string `json:"ItemId"`
	Type     string `json:"Type"`
	StartTicks int64  `json:"StartTicks"`
	EndTicks   int64  `json:"EndTicks"`
}

// MediaSegmentsResponse wraps a list of media segments.
type MediaSegmentsResponse struct {
	Items []MediaSegmentItem `json:"Items"`
}

// segmentTypeToJellyfin maps milmil segment types to Jellyfin segment types.
func segmentTypeToJellyfin(t string) (string, bool) {
	switch t {
	case "op":
		return "Intro", true
	case "ed":
		return "Outro", true
	case "recap":
		return "Recap", true
	default:
		return "", false
	}
}

func (h *Handler) handleMediaSegments(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusOK, MediaSegmentsResponse{Items: []MediaSegmentItem{}})
	}

	ctx := c.Request().Context()
	var marks []store.SegmentMark

	switch typ {
	case "episode":
		files, err := h.queries.ListMediaFilesByEpisodeID(ctx, id)
		if err != nil || len(files) == 0 {
			return c.JSON(http.StatusOK, MediaSegmentsResponse{Items: []MediaSegmentItem{}})
		}
		for _, f := range files {
			fileMarks, err := h.queries.ListSegmentMarks(ctx, f.ID)
			if err == nil {
				marks = append(marks, fileMarks...)
			}
		}
	case "file":
		marks, _ = h.queries.ListSegmentMarks(ctx, id)
	default:
		return c.JSON(http.StatusOK, MediaSegmentsResponse{Items: []MediaSegmentItem{}})
	}

	items := make([]MediaSegmentItem, 0, len(marks))
	for _, m := range marks {
		jellyType, ok := segmentTypeToJellyfin(m.Type)
		if !ok {
			continue
		}
		items = append(items, MediaSegmentItem{
			ID:         m.ID,
			ItemID:     itemIDEncoded,
			Type:       jellyType,
			StartTicks: int64(m.StartTime * 10_000_000),
			EndTicks:   int64(m.EndTime * 10_000_000),
		})
	}

	return c.JSON(http.StatusOK, MediaSegmentsResponse{Items: items})
}
