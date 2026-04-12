package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// SearchHandler implements /search <query> — anime search with per-result buttons.
func SearchHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		query := strings.TrimSpace(cmd.Args)
		if query == "" {
			return &bot.BotResponse{Text: "Usage: /search &lt;anime name&gt;"}, nil
		}

		results, err := svc.Metadata.Search(ctx, query, false)
		if err != nil {
			return &bot.BotResponse{Text: "Search failed."}, nil
		}

		if len(results) == 0 {
			return &bot.BotResponse{Text: fmt.Sprintf("No results for %q.", query)}, nil
		}

		if len(results) > 5 {
			results = results[:5]
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
					{Label: "Subscribe", Data: fmt.Sprintf("sub_pick:%d", r.BangumiID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("Results for %q:", query),
			List: items,
		}, nil
	}
}
