package bot

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/milmil/api/internal/store"
)

// ReportGenerator builds periodic summary reports.
type ReportGenerator struct {
	Queries *store.Queries
}

// GenerateDailyReport creates a summary of system activity.
func (r *ReportGenerator) GenerateDailyReport(ctx context.Context) (*BotResponse, error) {
	// Active downloads
	active, _ := r.Queries.ListActiveDownloads(ctx)

	// Completed in last 24h
	cutoff := time.Now().Add(-24 * time.Hour).Format(time.RFC3339)
	recentComplete, _ := r.Queries.ListRecentCompletedDownloads(ctx, cutoff)

	// Error downloads
	errorDownloads, _ := r.Queries.ListErrorDownloads(ctx)

	// RSS feeds
	feeds, _ := r.Queries.ListRSSFeeds(ctx)

	// Download rules
	rules, _ := r.Queries.ListDownloadRules(ctx)

	var text strings.Builder
	text.WriteString("<b>📊 Daily Report</b>\n\n")
	fmt.Fprintf(&text, "📥 Active downloads: <b>%d</b>\n", len(active))
	if len(errorDownloads) > 0 {
		fmt.Fprintf(&text, "⚠️ Downloads with errors: <b>%d</b>\n", len(errorDownloads))
	}
	fmt.Fprintf(&text, "✅ Completed (24h): <b>%d</b>\n", len(recentComplete))
	fmt.Fprintf(&text, "📡 RSS feeds: <b>%d</b>\n", len(feeds))
	fmt.Fprintf(&text, "📋 追番規則：<b>%d</b>\n", len(rules))

	if len(recentComplete) > 0 {
		text.WriteString("\n<b>Recent Downloads:</b>\n")
		limit := min(len(recentComplete), 5)
		for i := range limit {
			fmt.Fprintf(&text, "• %s\n", recentComplete[i].Name)
		}
		if len(recentComplete) > 5 {
			fmt.Fprintf(&text, "  <i>…and %d more</i>\n", len(recentComplete)-5)
		}
	}

	return &BotResponse{
		Text: text.String(),
		Buttons: [][]BotButton{
			{{Label: "⬅️ Menu", Data: "menu"}},
		},
	}, nil
}
