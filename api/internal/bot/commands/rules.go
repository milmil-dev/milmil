package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/store"
)

// RulesHandler implements /rules — list active download rules.
func RulesHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		rules, err := svc.Queries.ListDownloadRules(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load rules."}, nil
		}

		// Build a feed ID -> name lookup
		feedNames := map[string]string{}
		feeds, err := svc.Queries.ListRSSFeeds(ctx)
		if err == nil {
			for _, f := range feeds {
				feedNames[f.ID] = f.Name
			}
		}

		// Filter to enabled rules only
		var enabled []struct {
			ID               string
			Name             string
			FeedName         string
			SubgroupFilter   string
			ResolutionFilter string
			LastTriggered    string
		}
		for _, r := range rules {
			if r.Enabled == 0 {
				continue
			}
			feedName := feedNames[r.RssFeedID]
			if feedName == "" {
				feedName = "Unknown"
			}

			lastTriggered := "never"
			if r.LastTriggeredAt.Valid && r.LastTriggeredAt.String != "" {
				lastTriggered = relativeTime(r.LastTriggeredAt.String)
			}

			enabled = append(enabled, struct {
				ID               string
				Name             string
				FeedName         string
				SubgroupFilter   string
				ResolutionFilter string
				LastTriggered    string
			}{
				ID:               r.ID,
				Name:             r.Name,
				FeedName:         feedName,
				SubgroupFilter:   r.SubgroupFilter,
				ResolutionFilter: r.ResolutionFilter,
				LastTriggered:    lastTriggered,
			})
		}

		if len(enabled) == 0 {
			return &bot.BotResponse{
				Text: "No active download rules.",
				Buttons: [][]bot.BotButton{
					{{Label: "⬅️ Menu", Data: "cmd:start"}},
				},
			}, nil
		}

		if len(enabled) > 15 {
			enabled = enabled[:15]
		}

		items := make([]bot.BotListItem, 0, len(enabled))
		for _, r := range enabled {
			subtitle := "📡 " + r.FeedName
			var filters []string
			if r.SubgroupFilter != "" {
				filters = append(filters, r.SubgroupFilter)
			}
			if r.ResolutionFilter != "" {
				filters = append(filters, r.ResolutionFilter)
			}
			if len(filters) > 0 {
				subtitle += " · " + strings.Join(filters, " / ")
			}
			subtitle += " · " + r.LastTriggered

			items = append(items, bot.BotListItem{
				Title:    truncate(r.Name, 60),
				Subtitle: subtitle,
				Buttons: []bot.BotButton{
					{Label: "Disable", Data: fmt.Sprintf("rule_disable:%s", r.ID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("<b>Download Rules</b> (%d active)", len(enabled)),
			List: items,
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}

// RuleDisableCallback handles the rule_disable callback.
func RuleDisableCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid action."}, nil
		}
		ruleID := parts[1]

		rule, err := svc.Queries.GetDownloadRule(ctx, ruleID)
		if err != nil {
			return &bot.BotResponse{Text: "Rule not found."}, nil
		}

		rule.Enabled = 0
		err = svc.Queries.UpdateDownloadRule(ctx, ruleToUpdateParams(rule))
		if err != nil {
			return &bot.BotResponse{Text: fmt.Sprintf("Failed to disable rule: %v", err)}, nil
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("Rule <b>%s</b> disabled.", truncate(rule.Name, 40)),
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}

// ruleToUpdateParams converts a DownloadRule to UpdateDownloadRuleParams with the current field values.
func ruleToUpdateParams(r store.DownloadRule) store.UpdateDownloadRuleParams {
	return store.UpdateDownloadRuleParams{
		ID:               r.ID,
		Name:             r.Name,
		Enabled:          r.Enabled,
		RssFeedID:        r.RssFeedID,
		FilterRegex:      r.FilterRegex,
		ExcludeRegex:     r.ExcludeRegex,
		SaveDir:          r.SaveDir,
		EpisodeOffset:    r.EpisodeOffset,
		ResolutionFilter: r.ResolutionFilter,
		SubgroupFilter:   r.SubgroupFilter,
		MinSeeders:       r.MinSeeders,
		LibraryID:        r.LibraryID,
		BangumiID:        r.BangumiID,
		MatchMode:        r.MatchMode,
		EpisodeFilter:    r.EpisodeFilter,
		EpisodeRange:     r.EpisodeRange,
	}
}

// relativeTime converts a timestamp string to a relative time like "2h ago".
func relativeTime(ts string) string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t, err = time.Parse("2006-01-02 15:04:05", ts)
		if err != nil {
			return ts
		}
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}
