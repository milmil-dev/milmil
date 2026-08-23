// Package telegram provides the Telegram transport adapter for the milmil
// interactive bot. The renderer converts platform-agnostic BotResponse values
// into Telegram message configs (plain messages or photo messages) and also
// handles building inline keyboards from explicit button rows and list item
// buttons.
package telegram

import (
	"fmt"
	"strings"
	"unicode/utf8"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/milmil/api/internal/bot"
)

// sanitizeUTF8 removes invalid UTF-8 bytes from a string.
func sanitizeUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	return strings.ToValidUTF8(s, "")
}

// RenderMessage converts a BotResponse into a Telegram message config suitable
// for sending a brand new message. When the response includes an ImageURL a
// NewPhoto config with caption is returned; otherwise a NewMessage config is
// returned. HTML parse mode is used in both cases.
func RenderMessage(chatID int64, resp *bot.BotResponse) tgbotapi.Chattable {
	text := buildText(resp)
	keyboard := buildKeyboard(resp)

	if resp.ImageURL != "" {
		photo := tgbotapi.NewPhoto(chatID, tgbotapi.FileURL(resp.ImageURL))
		photo.Caption = text
		photo.ParseMode = "HTML"
		if keyboard != nil {
			photo.ReplyMarkup = keyboard
		}
		return photo
	}

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "HTML"
	msg.DisableWebPagePreview = true
	if keyboard != nil {
		msg.ReplyMarkup = keyboard
	}
	return msg
}

// RenderEditMessage converts a BotResponse into a Telegram edit-message config
// for updating an existing text message in place after a callback.
func RenderEditMessage(chatID int64, messageID int, resp *bot.BotResponse) tgbotapi.Chattable {
	text := buildText(resp)
	keyboard := buildKeyboard(resp)

	edit := tgbotapi.NewEditMessageText(chatID, messageID, text)
	edit.ParseMode = "HTML"
	edit.DisableWebPagePreview = true
	if keyboard != nil {
		markup := tgbotapi.InlineKeyboardMarkup{InlineKeyboard: keyboard.InlineKeyboard}
		edit.ReplyMarkup = &markup
	}
	return edit
}

// buildText concatenates the response Text, Fields (as "<b>Label:</b> Value")
// and List items (as numbered entries with optional subtitles) into a single
// HTML string.
func buildText(resp *bot.BotResponse) string {
	var sb strings.Builder
	sb.WriteString(resp.Text)

	if len(resp.Fields) > 0 {
		sb.WriteString("\n")
		for _, f := range resp.Fields {
			fmt.Fprintf(&sb, "\n<b>%s:</b> %s", f.Label, f.Value)
		}
	}

	if len(resp.List) > 0 {
		sb.WriteString("\n")
		for i, item := range resp.List {
			fmt.Fprintf(&sb, "\n<b>%d.</b> %s", i+1, item.Title)
			if item.Subtitle != "" {
				fmt.Fprintf(&sb, "\n    %s", item.Subtitle)
			}
		}
	}

	return sanitizeUTF8(sb.String())
}

// buildKeyboard converts the explicit Buttons rows and any per-list-item
// Buttons into a single Telegram InlineKeyboardMarkup. Returns nil if there
// are no buttons at all.
func buildKeyboard(resp *bot.BotResponse) *tgbotapi.InlineKeyboardMarkup {
	var rows [][]tgbotapi.InlineKeyboardButton

	for _, row := range resp.Buttons {
		var tgRow []tgbotapi.InlineKeyboardButton
		for _, btn := range row {
			if btn.URL != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonURL(btn.Label, btn.URL))
			} else if btn.Data != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonData(btn.Label, btn.Data))
			}
		}
		if len(tgRow) > 0 {
			rows = append(rows, tgRow)
		}
	}

	for i, item := range resp.List {
		if len(item.Buttons) == 0 {
			continue
		}
		var tgRow []tgbotapi.InlineKeyboardButton
		for _, btn := range item.Buttons {
			label := fmt.Sprintf("%d. %s", i+1, btn.Label)
			if btn.URL != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonURL(label, btn.URL))
			} else if btn.Data != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonData(btn.Label, btn.Data))
			}
		}
		if len(tgRow) > 0 {
			rows = append(rows, tgRow)
		}
	}

	if len(rows) == 0 {
		return nil
	}

	markup := tgbotapi.NewInlineKeyboardMarkup(rows...)
	return &markup
}
