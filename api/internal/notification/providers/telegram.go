package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/milmil/api/internal/notification"
)

var severityEmoji = map[string]string{
	"success": "\u2705",
	"error":   "\u274c",
	"info":    "\u2139\ufe0f",
}

// TelegramProvider sends notifications via the Telegram Bot API with HTML formatting.
type TelegramProvider struct {
	botToken string
	chatID   string
	client   *http.Client
	baseURL  string
}

// NewTelegramProvider creates a TelegramProvider that posts to the given chat via botToken.
func NewTelegramProvider(botToken, chatID string, client *http.Client) *TelegramProvider {
	return &TelegramProvider{
		botToken: botToken,
		chatID:   chatID,
		client:   client,
		baseURL:  "https://api.telegram.org",
	}
}

func (t *TelegramProvider) Name() string { return "telegram" }

func (t *TelegramProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	emoji := severityEmoji[event.Severity]
	if emoji == "" {
		emoji = severityEmoji["info"]
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s <b>%s</b>\n%s", emoji, event.Title, event.Message))

	for k, v := range event.Metadata {
		sb.WriteString(fmt.Sprintf("\n%s: %s", k, v))
	}

	payload := map[string]string{
		"chat_id":    t.chatID,
		"text":       sb.String(),
		"parse_mode": "HTML",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("telegram: marshal: %w", err)
	}

	url := fmt.Sprintf("%s/bot%s/sendMessage", t.baseURL, t.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("telegram: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram: unexpected status %d", resp.StatusCode)
	}
	return nil
}
