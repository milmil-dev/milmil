package bot

import (
	"context"
	"fmt"
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

	text := "<b>📊 Daily Report</b>\n\n"
	text += fmt.Sprintf("📥 Active downloads: <b>%d</b>\n", len(active))
	if len(errorDownloads) > 0 {
		text += fmt.Sprintf("⚠️ Downloads with errors: <b>%d</b>\n", len(errorDownloads))
	}
	text += fmt.Sprintf("✅ Completed (24h): <b>%d</b>\n", len(recentComplete))
	text += fmt.Sprintf("📡 RSS feeds: <b>%d</b>\n", len(feeds))
	text += fmt.Sprintf("📋 Subscription rules: <b>%d</b>\n", len(rules))

	if len(recentComplete) > 0 {
		text += "\n<b>Recent Downloads:</b>\n"
		limit := len(recentComplete)
		if limit > 5 {
			limit = 5
		}
		for i := 0; i < limit; i++ {
			text += fmt.Sprintf("• %s\n", recentComplete[i].Name)
		}
		if len(recentComplete) > 5 {
			text += fmt.Sprintf("  <i>…and %d more</i>\n", len(recentComplete)-5)
		}
	}

	return &BotResponse{
		Text: text,
		Buttons: [][]BotButton{
			{{Label: "⬅️ Menu", Data: "menu"}},
		},
	}, nil
}
