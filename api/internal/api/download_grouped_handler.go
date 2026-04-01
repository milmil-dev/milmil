package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type groupedDownloads struct {
	RuleID           string         `json:"rule_id"`
	RuleName         string         `json:"rule_name"`
	BangumiID        *int64         `json:"bangumi_id,omitempty"`
	LibraryID        *string        `json:"library_id,omitempty"`
	LibraryName      string         `json:"library_name,omitempty"`
	Source           string         `json:"source,omitempty"`
	ResolutionFilter string         `json:"resolution_filter,omitempty"`
	SubGroupFilter   string         `json:"subgroup_filter,omitempty"`
	Downloads        []downloadItem `json:"downloads"`
	ActiveCount      int            `json:"active_count"`
	CompleteCount    int            `json:"complete_count"`
	TotalCount       int            `json:"total_count"`
}

type downloadItem struct {
	ID             string `json:"id"`
	GID            string `json:"gid"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	TotalBytes     int64  `json:"total_bytes"`
	CompletedBytes int64  `json:"completed_bytes"`
	SpeedBytes     int64  `json:"speed_bytes"`
	CreatedAt      string `json:"created_at"`
}

// handleDownloadsGrouped returns downloads grouped by subscription (rule).
func (h *handler) handleDownloadsGrouped(c echo.Context) error {
	ctx := c.Request().Context()

	downloads, err := h.queries.ListDownloads(ctx)
	if err != nil {
		return echo.ErrInternalServerError
	}

	rules, err := h.queries.ListDownloadRules(ctx)
	if err != nil {
		return echo.ErrInternalServerError
	}

	feeds, err := h.queries.ListRSSFeeds(ctx)
	if err != nil {
		return echo.ErrInternalServerError
	}

	libraries, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Build lookups
	feedMap := make(map[string]string)
	for _, f := range feeds {
		feedMap[f.ID] = f.Type
	}
	libMap := make(map[string]string)
	for _, l := range libraries {
		libMap[l.ID] = l.Name
	}

	// Group downloads by rule
	ruleDownloads := make(map[string][]downloadItem)
	ungrouped := make([]downloadItem, 0)
	for _, dl := range downloads {
		item := downloadItem{
			ID:             dl.ID,
			GID:            dl.Gid,
			Name:           dl.Name,
			Status:         dl.Status,
			TotalBytes:     dl.TotalBytes,
			CompletedBytes: dl.CompletedBytes,
			SpeedBytes:     dl.SpeedBytes,
			CreatedAt:      dl.CreatedAt,
		}
		if dl.RuleID.Valid {
			ruleDownloads[dl.RuleID.String] = append(ruleDownloads[dl.RuleID.String], item)
		} else {
			ungrouped = append(ungrouped, item)
		}
	}

	// Build grouped response
	groups := make([]groupedDownloads, 0)
	for _, rule := range rules {
		dls, ok := ruleDownloads[rule.ID]
		if !ok || len(dls) == 0 {
			continue
		}

		g := groupedDownloads{
			RuleID:           rule.ID,
			RuleName:         rule.Name,
			ResolutionFilter: rule.ResolutionFilter,
			SubGroupFilter:   rule.SubgroupFilter,
			Downloads:        dls,
			TotalCount:       len(dls),
		}

		if rule.BangumiID.Valid {
			g.BangumiID = &rule.BangumiID.Int64
		}
		if rule.LibraryID.Valid {
			g.LibraryID = &rule.LibraryID.String
			g.LibraryName = libMap[rule.LibraryID.String]
		}
		g.Source = feedMap[rule.RssFeedID]

		for _, dl := range dls {
			switch dl.Status {
			case "active", "waiting":
				g.ActiveCount++
			case "complete":
				g.CompleteCount++
			}
		}

		groups = append(groups, g)
	}

	// Add ungrouped as a special group
	if len(ungrouped) > 0 {
		g := groupedDownloads{
			RuleName:   "Manual Downloads",
			Downloads:  ungrouped,
			TotalCount: len(ungrouped),
		}
		for _, dl := range ungrouped {
			switch dl.Status {
			case "active", "waiting":
				g.ActiveCount++
			case "complete":
				g.CompleteCount++
			}
		}
		groups = append(groups, g)
	}

	return c.JSON(http.StatusOK, groups)
}

// handleDownloadFiles returns the file list for a specific Aria2 download.
func (h *handler) handleDownloadFiles(c echo.Context) error {
	gid := c.Param("gid")
	status, err := h.aria2.GetStatus(c.Request().Context(), gid)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "aria2 error: "+err.Error())
	}

	type fileInfo struct {
		Path     string `json:"path"`
		Size     int64  `json:"size"`
		Complete int64  `json:"complete"`
		Selected bool   `json:"selected"`
	}

	files := make([]fileInfo, 0, len(status.Files))
	for _, f := range status.Files {
		size, _ := strconv.ParseInt(f.Length, 10, 64)
		complete, _ := strconv.ParseInt(f.CompletedLength, 10, 64)
		files = append(files, fileInfo{
			Path:     f.Path,
			Size:     size,
			Complete: complete,
			Selected: f.Selected == "true",
		})
	}

	name := ""
	if status.BitTorrent != nil {
		name = status.BitTorrent.Info.Name
	}

	return c.JSON(http.StatusOK, map[string]any{
		"gid":    gid,
		"name":   name,
		"status": status.Status,
		"dir":    status.Dir,
		"files":  files,
	})
}
