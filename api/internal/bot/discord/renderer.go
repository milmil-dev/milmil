package discord

import (
	"fmt"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/milmil/api/internal/bot"
)

// RenderInteractionResponse converts a BotResponse to a Discord interaction response.
func RenderInteractionResponse(resp *bot.BotResponse) *discordgo.InteractionResponse {
	embed := buildEmbed(resp)
	components := buildComponents(resp)

	data := &discordgo.InteractionResponseData{
		Embeds: []*discordgo.MessageEmbed{embed},
	}
	if len(components) > 0 {
		data.Components = components
	}

	return &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: data,
	}
}

// RenderMessage converts a BotResponse to a Discord message send.
func RenderMessage(resp *bot.BotResponse) *discordgo.MessageSend {
	embed := buildEmbed(resp)
	components := buildComponents(resp)

	msg := &discordgo.MessageSend{
		Embeds: []*discordgo.MessageEmbed{embed},
	}
	if len(components) > 0 {
		msg.Components = components
	}
	return msg
}

func buildEmbed(resp *bot.BotResponse) *discordgo.MessageEmbed {
	// Strip HTML tags for Discord (uses markdown).
	desc := stripHTML(resp.Text)

	embed := &discordgo.MessageEmbed{
		Description: desc,
		Color:       0x3b82f6, // blue
	}

	if resp.ImageURL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: resp.ImageURL}
	}

	for _, f := range resp.Fields {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:   f.Label,
			Value:  f.Value,
			Inline: f.Inline,
		})
	}

	// List items rendered as a single "Results" field with a markdown list.
	if len(resp.List) > 0 {
		var sb strings.Builder
		for i, item := range resp.List {
			fmt.Fprintf(&sb, "**%d.** %s", i+1, item.Title)
			if item.Subtitle != "" {
				fmt.Fprintf(&sb, "\n%s", item.Subtitle)
			}
			sb.WriteString("\n")
		}
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:  "Results",
			Value: sb.String(),
		})
	}

	return embed
}

func buildComponents(resp *bot.BotResponse) []discordgo.MessageComponent {
	var rows []discordgo.MessageComponent

	// Button rows.
	for _, row := range resp.Buttons {
		var buttons []discordgo.MessageComponent
		for _, btn := range row {
			if btn.URL != "" {
				buttons = append(buttons, discordgo.Button{
					Label: btn.Label,
					Style: discordgo.LinkButton,
					URL:   btn.URL,
				})
			} else if btn.Data != "" {
				buttons = append(buttons, discordgo.Button{
					Label:    btn.Label,
					Style:    discordgo.PrimaryButton,
					CustomID: btn.Data,
				})
			}
		}
		if len(buttons) > 0 {
			rows = append(rows, discordgo.ActionsRow{Components: buttons})
		}
	}

	// List item buttons — one row per item.
	for _, item := range resp.List {
		if len(item.Buttons) == 0 {
			continue
		}
		var buttons []discordgo.MessageComponent
		for _, btn := range item.Buttons {
			if btn.URL != "" {
				buttons = append(buttons, discordgo.Button{
					Label: btn.Label,
					Style: discordgo.LinkButton,
					URL:   btn.URL,
				})
			} else if btn.Data != "" {
				buttons = append(buttons, discordgo.Button{
					Label:    btn.Label,
					Style:    discordgo.SecondaryButton,
					CustomID: btn.Data,
				})
			}
		}
		if len(buttons) > 0 {
			rows = append(rows, discordgo.ActionsRow{Components: buttons})
		}
	}

	return rows
}

// stripHTML converts a small subset of HTML tags to Discord markdown and
// strips any remaining tags.
func stripHTML(s string) string {
	s = strings.ReplaceAll(s, "<b>", "**")
	s = strings.ReplaceAll(s, "</b>", "**")
	s = strings.ReplaceAll(s, "<i>", "*")
	s = strings.ReplaceAll(s, "</i>", "*")
	s = strings.ReplaceAll(s, "<code>", "`")
	s = strings.ReplaceAll(s, "</code>", "`")

	var result strings.Builder
	inTag := false
	for _, c := range s {
		if c == '<' {
			inTag = true
			continue
		}
		if c == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(c)
		}
	}
	return result.String()
}
