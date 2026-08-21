package commands

import (
	"context"
	"fmt"
	"time"

	"github.com/milmil/api/internal/bot"
)

// RecentHandler implements /recent — recently completed downloads (last 48h).
func RecentHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		allCompleted, err := svc.Queries.ListCompletedDownloads(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load downloads."}, nil
		}

		cutoff := time.Now().Add(-48 * time.Hour)

		var recent []struct {
			Name       string
			Size       int64
			BangumiID  int64
			HasBangumi bool
		}
		for _, dl := range allCompleted {
			t, err := time.Parse(time.RFC3339, dl.UpdatedAt)
			if err != nil {
				t, err = time.Parse("2006-01-02 15:04:05", dl.UpdatedAt)
				if err != nil {
					continue
				}
			}
			if t.After(cutoff) {
				entry := struct {
					Name       string
					Size       int64
					BangumiID  int64
					HasBangumi bool
				}{
					Name: dl.Name,
					Size: dl.TotalBytes,
				}
				if dl.BangumiID.Valid {
					entry.BangumiID = dl.BangumiID.Int64
					entry.HasBangumi = true
				}
				recent = append(recent, entry)
			}
		}

		if len(recent) == 0 {
			return &bot.BotResponse{
				Text: "No completed downloads in the last 48 hours.",
				Buttons: [][]bot.BotButton{
					{{Label: "⬅️ Menu", Data: "cmd:start"}},
				},
			}, nil
		}

		if len(recent) > 15 {
			recent = recent[:15]
		}

		items := make([]bot.BotListItem, 0, len(recent))
		for i, dl := range recent {
			subtitle := formatBytes(dl.Size)

			var buttons []bot.BotButton
			if dl.HasBangumi {
				buttons = append(buttons, bot.BotButton{
					Label: "Detail",
					Data:  fmt.Sprintf("detail:%d", dl.BangumiID),
				})
			}

			items = append(items, bot.BotListItem{
				Title:    fmt.Sprintf("%d. %s", i+1, truncate(dl.Name, 55)),
				Subtitle: subtitle,
				Buttons:  buttons,
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("<b>Recent Downloads</b> (last 48h) — %d items", len(recent)),
			List: items,
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}
