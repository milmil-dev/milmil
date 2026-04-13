package commands

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/store"
)

// SubscribeHandler implements /subscribe <query> — searches and shows source picker.
func SubscribeHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		query := strings.TrimSpace(cmd.Args)
		if query == "" {
			return &bot.BotResponse{Text: "Usage: /subscribe &lt;anime name&gt;"}, nil
		}

		results, err := svc.Metadata.Search(ctx, query, false)
		if err != nil || len(results) == 0 {
			return &bot.BotResponse{Text: fmt.Sprintf("No anime found for %q.", query)}, nil
		}

		anime := results[0]
		title := anime.Title
		if title == "" {
			title = anime.TitleOriginal
		}

		return &bot.BotResponse{
			Text:     fmt.Sprintf("追番 <b>%s</b>\n選擇 RSS 來源：", title),
			ImageURL: anime.CoverImage,
			Buttons: [][]bot.BotButton{
				{
					{Label: "Mikan", Data: fmt.Sprintf("sub_do:%d:mikan", anime.BangumiID)},
					{Label: "Nyaa", Data: fmt.Sprintf("sub_do:%d:nyaa", anime.BangumiID)},
					{Label: "DMHY", Data: fmt.Sprintf("sub_do:%d:dmhy", anime.BangumiID)},
				},
			},
		}, nil
	}
}

// SubscribePickCallback handles "sub_pick:<id>" — show source picker for a known anime.
func SubscribePickCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid callback."}, nil
		}
		id, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}

		detail, err := svc.Metadata.GetAnimeDetail(ctx, id)
		if err != nil || detail == nil {
			return &bot.BotResponse{Text: "Failed to load anime."}, nil
		}
		title := detail.Title
		if title == "" {
			title = detail.TitleOriginal
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("追番 <b>%s</b>\n選擇 RSS 來源：", title),
			Buttons: [][]bot.BotButton{
				{
					{Label: "Mikan", Data: fmt.Sprintf("sub_do:%d:mikan", id)},
					{Label: "Nyaa", Data: fmt.Sprintf("sub_do:%d:nyaa", id)},
					{Label: "DMHY", Data: fmt.Sprintf("sub_do:%d:dmhy", id)},
				},
			},
		}, nil
	}
}

// SubscribeDoCallback handles "sub_do:<id>:<source>" — creates RSS feed + download rule.
func SubscribeDoCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 3)
		if len(parts) < 3 {
			return &bot.BotResponse{Text: "Invalid subscribe callback."}, nil
		}
		bangumiID, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}
		source := parts[2]

		detail, err := svc.Metadata.GetAnimeDetail(ctx, bangumiID)
		if err != nil || detail == nil {
			return &bot.BotResponse{Text: "Failed to load anime details."}, nil
		}

		title := detail.Title
		if title == "" {
			title = detail.TitleOriginal
		}

		// Default save directory: first library.
		libraries, _ := svc.Queries.ListLibraries(ctx)
		var libraryID sql.NullString
		var saveDir string
		if len(libraries) > 0 {
			libraryID = sql.NullString{String: libraries[0].ID, Valid: true}
			saveDir = libraries[0].Path
		}

		var feedURL string
		switch source {
		case "mikan":
			feedURL = fmt.Sprintf("https://mikanani.me/RSS/Search?searchstr=%s", url.QueryEscape(title))
		case "nyaa":
			q := detail.TitleEN
			if q == "" {
				q = detail.TitleOriginal
			}
			if q == "" {
				q = title
			}
			feedURL = fmt.Sprintf("https://nyaa.si/?page=rss&q=%s&c=1_0&f=0", url.QueryEscape(q))
		case "dmhy":
			feedURL = fmt.Sprintf("https://share.dmhy.org/topics/rss/rss.xml?keyword=%s", url.QueryEscape(title))
		default:
			return &bot.BotResponse{Text: "Unknown source."}, nil
		}

		feed, err := svc.Queries.CreateRSSFeed(ctx, store.CreateRSSFeedParams{
			ID:                   uuid.NewString(),
			Name:                 fmt.Sprintf("[Bot] %s", title),
			Url:                  feedURL,
			Type:                 source,
			Enabled:              1,
			FetchIntervalMinutes: 30,
		})
		if err != nil {
			return &bot.BotResponse{Text: "Failed to create RSS feed."}, nil
		}

		filterRegex := fmt.Sprintf("(?i)%s", title)
		_, err = svc.Queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
			ID:               uuid.NewString(),
			Name:             title,
			Enabled:          1,
			RssFeedID:        feed.ID,
			FilterRegex:      filterRegex,
			ExcludeRegex:     "",
			SaveDir:          saveDir,
			EpisodeOffset:    0,
			ResolutionFilter: "",
			SubgroupFilter:   "",
			MinSeeders:       0,
			LibraryID:        libraryID,
			BangumiID:        sql.NullInt64{Int64: int64(bangumiID), Valid: true},
			MatchMode:        "fuzzy",
			EpisodeFilter:    "all",
			EpisodeRange:     "",
		})
		if err != nil {
			_ = svc.Queries.DeleteRSSFeed(ctx, feed.ID)
			return &bot.BotResponse{Text: "Failed to create download rule."}, nil
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("✅ 已追番 <b>%s</b>\n來源：%s\n新集數將自動下載", title, source),
		}, nil
	}
}
