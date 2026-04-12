package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// defaultBotUserID is used for recent-progress queries when there's no
// per-chat user mapping. TODO: thread an actual user ID through CommandContext.
const defaultBotUserID = "default"

// ContinueHandler implements /continue — recently watched episodes with progress bars.
func ContinueHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		progress, err := svc.Queries.ListRecentProgressWithAnime(ctx, defaultBotUserID)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load watch history."}, nil
		}

		if len(progress) == 0 {
			return &bot.BotResponse{Text: "No watch history yet."}, nil
		}

		if len(progress) > 10 {
			progress = progress[:10]
		}

		items := make([]bot.BotListItem, 0, len(progress))
		for _, p := range progress {
			title := p.AnimeTitle
			if p.AnimeTitleZh.Valid && p.AnimeTitleZh.String != "" {
				title = p.AnimeTitleZh.String
			}

			duration := int64(0)
			if p.DurationSeconds.Valid {
				duration = p.DurationSeconds.Int64
			}

			pct := 0.0
			if duration > 0 {
				pct = float64(p.PositionSeconds) / float64(duration) * 100
			}

			var subtitle string
			if p.Completed == 1 {
				subtitle = fmt.Sprintf("EP%g  Complete", p.EpisodeNumber)
			} else {
				bar := progressBar(pct, 8)
				subtitle = fmt.Sprintf("EP%g %s %.0f%%", p.EpisodeNumber, bar, pct)
			}

			cover := ""
			if p.AnimeCoverImageUrl.Valid {
				cover = p.AnimeCoverImageUrl.String
			}

			buttons := []bot.BotButton{}
			if p.AnimeBangumiID.Valid {
				buttons = append(buttons, bot.BotButton{
					Label: "Detail",
					Data:  fmt.Sprintf("detail:%d", p.AnimeBangumiID.Int64),
				})
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				ImageURL: cover,
				Buttons:  buttons,
			})
		}

		return &bot.BotResponse{
			Text: "<b>Continue Watching</b>",
			List: items,
		}, nil
	}
}
