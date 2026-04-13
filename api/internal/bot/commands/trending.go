package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// TrendingHandler implements /trending — trending anime from metadata service.
func TrendingHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		results, err := svc.Metadata.GetTrending(ctx, 1)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load trending anime."}, nil
		}

		if len(results) == 0 {
			return &bot.BotResponse{
				Text: "No trending anime found.",
				Buttons: [][]bot.BotButton{
					{{Label: "⬅️ Menu", Data: "cmd:start"}},
				},
			}, nil
		}

		if len(results) > 10 {
			results = results[:10]
		}

		items := make([]bot.BotListItem, 0, len(results))
		for _, r := range results {
			title := r.Title
			if title == "" {
				title = r.TitleOriginal
			}

			subtitle := ""
			if r.Score > 0 {
				subtitle = fmt.Sprintf("★ %.1f", r.Score)
			}
			if len(r.AirDate) >= 4 {
				if subtitle != "" {
					subtitle += " · "
				}
				subtitle += r.AirDate[:4]
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				ImageURL: r.CoverImage,
				Buttons: []bot.BotButton{
					{Label: "Detail", Data: fmt.Sprintf("detail:%d", r.BangumiID)},
					{Label: "➕ 追番", Data: fmt.Sprintf("sub_pick:%d", r.BangumiID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: "<b>📈 Trending Anime</b>",
			List: items,
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}
