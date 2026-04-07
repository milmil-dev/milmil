package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/milmil/api/internal/notification"
)

func init() {
	notification.RegisterProviderFactory("discord", func(fields map[string]string) notification.Provider {
		return NewDiscordProvider(fields["webhook_url"], &http.Client{Timeout: 10 * time.Second})
	})
}

type discordEmbed struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Color       int            `json:"color"`
	Fields      []discordField `json:"fields,omitempty"`
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type discordPayload struct {
	Embeds []discordEmbed `json:"embeds"`
}

var severityColors = map[string]int{
	"success": 0x22c55e,
	"error":   0xef4444,
	"info":    0x3b82f6,
}

// DiscordProvider sends notifications via Discord webhooks with rich embeds.
type DiscordProvider struct {
	webhookURL string
	client     *http.Client
}

// NewDiscordProvider creates a new Discord webhook notification provider.
func NewDiscordProvider(webhookURL string, client *http.Client) *DiscordProvider {
	return &DiscordProvider{webhookURL: webhookURL, client: client}
}

// Name returns the provider identifier.
func (d *DiscordProvider) Name() string { return "discord" }

// Send delivers a notification event to the configured Discord webhook.
func (d *DiscordProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	color := severityColors[event.Severity]
	if color == 0 {
		color = severityColors["info"]
	}

	embed := discordEmbed{
		Title:       event.Title,
		Description: event.Message,
		Color:       color,
	}

	for k, v := range event.Metadata {
		embed.Fields = append(embed.Fields, discordField{
			Name: k, Value: v, Inline: true,
		})
	}

	payload := discordPayload{Embeds: []discordEmbed{embed}}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("discord: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("discord: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("discord: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("discord: unexpected status %d", resp.StatusCode)
	}
	return nil
}
