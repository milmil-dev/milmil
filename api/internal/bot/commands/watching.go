package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/store"
)

// WatchingHandler implements /watching — shortcut for collection filtered to "watching".
func WatchingHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		collection, err := svc.Queries.ListCollectionAnime(ctx, store.ListCollectionAnimeParams{
			StatusFilter: "watching",
			SearchQuery:  "",
		})
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load collection."}, nil
		}

		if len(collection) == 0 {
			return &bot.BotResponse{
				Text: "No anime in your <b>watching</b> list.",
				Buttons: [][]bot.BotButton{
					{{Label: "⬅️ Menu", Data: "cmd:start"}},
				},
			}, nil
		}

		if len(collection) > 10 {
			collection = collection[:10]
		}

		items := make([]bot.BotListItem, 0, len(collection))
		for _, a := range collection {
			title := a.Title
			if a.TitleZh.Valid && a.TitleZh.String != "" {
				title = a.TitleZh.String
			}

			subtitle := ""
			if a.UserScore.Valid && a.UserScore.Int64 > 0 {
				subtitle = fmt.Sprintf("★ %d/10", a.UserScore.Int64)
			}
			if a.TotalEpisodes.Valid && a.TotalEpisodes.Int64 > 0 {
				if subtitle != "" {
					subtitle += " · "
				}
				subtitle += fmt.Sprintf("%d eps", a.TotalEpisodes.Int64)
			}

			var buttons []bot.BotButton
			if a.BangumiID.Valid {
				buttons = append(buttons, bot.BotButton{
					Label: "Detail",
					Data:  fmt.Sprintf("detail:%d", a.BangumiID.Int64),
				})
			}

			cover := ""
			if a.CoverImageUrl.Valid {
				cover = a.CoverImageUrl.String
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				ImageURL: cover,
				Buttons:  buttons,
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("<b>Currently Watching</b> (%d)", len(collection)),
			List: items,
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}
