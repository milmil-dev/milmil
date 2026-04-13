package commands

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// DetailHandler implements /detail <id> — anime card.
func DetailHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		idStr := strings.TrimSpace(cmd.Args)
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			return &bot.BotResponse{Text: "Usage: /detail &lt;bangumi_id&gt;"}, nil
		}
		return buildDetailResponse(ctx, svc, id)
	}
}

// DetailCallback handles "detail:<id>" callbacks from inline buttons.
func DetailCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid detail callback."}, nil
		}
		id, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}
		return buildDetailResponse(ctx, svc, id)
	}
}

func buildDetailResponse(ctx context.Context, svc *Services, bangumiID int) (*bot.BotResponse, error) {
	detail, err := svc.Metadata.GetAnimeDetail(ctx, bangumiID)
	if err != nil || detail == nil {
		return &bot.BotResponse{Text: "Failed to load anime details."}, nil
	}

	title := detail.Title
	if title == "" {
		title = detail.TitleOriginal
	}

	synopsis := detail.Synopsis
	if synopsis == "" {
		synopsis = detail.Description
	}
	if len(synopsis) > 300 {
		synopsis = synopsis[:297] + "..."
	}

	genres := strings.Join(detail.Genres, ", ")

	fields := []bot.BotField{}
	if detail.Score > 0 {
		fields = append(fields, bot.BotField{Label: "Score", Value: fmt.Sprintf("★ %.1f", detail.Score), Inline: true})
	}
	if detail.EpisodeCount > 0 {
		fields = append(fields, bot.BotField{Label: "Episodes", Value: fmt.Sprintf("%d", detail.EpisodeCount), Inline: true})
	}
	if detail.AirDate != "" {
		fields = append(fields, bot.BotField{Label: "Air Date", Value: detail.AirDate, Inline: true})
	}
	if genres != "" {
		fields = append(fields, bot.BotField{Label: "Genres", Value: genres})
	}

	text := fmt.Sprintf("<b>%s</b>", title)
	if detail.TitleOriginal != "" && detail.TitleOriginal != title {
		text += fmt.Sprintf("\n<i>%s</i>", detail.TitleOriginal)
	}
	if synopsis != "" {
		text += fmt.Sprintf("\n\n%s", synopsis)
	}

	// Check if already subscribed (has a download rule with this bangumi_id)
	subscribed := false
	if rules, err := svc.Queries.ListDownloadRules(ctx); err == nil {
		for _, rule := range rules {
			if rule.Enabled == 1 && rule.BangumiID.Valid && int(rule.BangumiID.Int64) == bangumiID {
				subscribed = true
				break
			}
		}
	}

	var actionBtn bot.BotButton
	if subscribed {
		actionBtn = bot.BotButton{Label: "✅ Subscribed", Data: fmt.Sprintf("detail:%d", bangumiID)}
	} else {
		actionBtn = bot.BotButton{Label: "➕ Subscribe", Data: fmt.Sprintf("sub_pick:%d", bangumiID)}
	}

	return &bot.BotResponse{
		Text:     text,
		ImageURL: detail.CoverImage,
		Fields:   fields,
		Buttons: [][]bot.BotButton{
			{
				actionBtn,
				{Label: "Bangumi", URL: fmt.Sprintf("https://bgm.tv/subject/%d", bangumiID)},
			},
		},
	}, nil
}
