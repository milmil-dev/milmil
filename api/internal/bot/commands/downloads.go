package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// DownloadsHandler implements /downloads — active downloads with progress bars.
func DownloadsHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		downloads, err := svc.Queries.ListActiveDownloads(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load downloads."}, nil
		}
		if len(downloads) == 0 {
			return &bot.BotResponse{Text: "No active downloads."}, nil
		}

		items := make([]bot.BotListItem, 0, len(downloads))
		for _, dl := range downloads {
			pct := 0.0
			if dl.TotalBytes > 0 {
				pct = float64(dl.CompletedBytes) / float64(dl.TotalBytes) * 100
			}
			bar := progressBar(pct, 10)

			subtitle := fmt.Sprintf("%s %.0f%%", bar, pct)
			if dl.SpeedBytes > 0 {
				subtitle += fmt.Sprintf(" · %s/s", formatBytes(dl.SpeedBytes))
			}

			buttons := []bot.BotButton{}
			switch dl.Status {
			case "active":
				buttons = append(buttons, bot.BotButton{Label: "Pause", Data: fmt.Sprintf("dl_pause:%s", dl.Gid)})
			case "paused":
				buttons = append(buttons, bot.BotButton{Label: "Resume", Data: fmt.Sprintf("dl_resume:%s", dl.Gid)})
			}
			buttons = append(buttons, bot.BotButton{Label: "Cancel", Data: fmt.Sprintf("dl_cancel:%s", dl.Gid)})

			items = append(items, bot.BotListItem{
				Title:    truncate(dl.Name, 60),
				Subtitle: subtitle,
				Buttons:  buttons,
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("<b>Active Downloads</b> (%d)", len(downloads)),
			List: items,
		}, nil
	}
}

// DownloadControlCallback handles dl_pause, dl_resume, dl_cancel callbacks.
func DownloadControlCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid action."}, nil
		}
		action, gid := parts[0], parts[1]

		if svc.Downloader == nil {
			return &bot.BotResponse{Text: "Downloader unavailable."}, nil
		}

		switch action {
		case "dl_pause":
			if err := svc.Downloader.Pause(ctx, gid); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to pause: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "Download paused."}, nil
		case "dl_resume":
			if err := svc.Downloader.Resume(ctx, gid); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to resume: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "Download resumed."}, nil
		case "dl_cancel":
			if err := svc.Downloader.Remove(ctx, gid, true); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to cancel: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "Download cancelled."}, nil
		}
		return &bot.BotResponse{Text: "Unknown action."}, nil
	}
}
