package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// maskSecret returns first 4 + "••••••••" + last 4 characters of s.
// If s is too short, it masks entirely.
func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 8 {
		return "••••••••"
	}
	return s[:4] + "••••••••" + s[len(s)-4:]
}

// isMasked returns true if the value contains the mask placeholder.
func isMasked(s string) bool {
	return strings.Contains(s, "••••••••")
}

func (h *handler) handleGetNotificationSettings(c *echo.Context) error {
	ctx := c.Request().Context()

	cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Mask sensitive fields
	cfg.Providers.Discord.WebhookURL = maskSecret(cfg.Providers.Discord.WebhookURL)
	cfg.Providers.Telegram.BotToken = maskSecret(cfg.Providers.Telegram.BotToken)
	cfg.Providers.Webhook.URL = maskSecret(cfg.Providers.Webhook.URL)
	cfg.Providers.Webhook.Secret = maskSecret(cfg.Providers.Webhook.Secret)

	return c.JSON(http.StatusOK, cfg)
}

func (h *handler) handleUpdateNotificationSettings(c *echo.Context) error {
	ctx := c.Request().Context()

	var incoming notification.NotificationConfig
	if err := c.Bind(&incoming); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	// Load existing config to preserve masked values
	existing, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Preserve original secrets when the client sends back masked values
	if isMasked(incoming.Providers.Discord.WebhookURL) {
		incoming.Providers.Discord.WebhookURL = existing.Providers.Discord.WebhookURL
	}
	if isMasked(incoming.Providers.Telegram.BotToken) {
		incoming.Providers.Telegram.BotToken = existing.Providers.Telegram.BotToken
	}
	if isMasked(incoming.Providers.Webhook.URL) {
		incoming.Providers.Webhook.URL = existing.Providers.Webhook.URL
	}
	if isMasked(incoming.Providers.Webhook.Secret) {
		incoming.Providers.Webhook.Secret = existing.Providers.Webhook.Secret
	}

	data, err := json.Marshal(incoming)
	if err != nil {
		return echo.ErrInternalServerError
	}

	_, err = h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   "notifications",
		Value: string(data),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleTestNotification(c *echo.Context) error {
	ctx := c.Request().Context()

	var body struct {
		Provider string `json:"provider"`
	}
	if err := c.Bind(&body); err != nil || body.Provider == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "provider is required")
	}

	cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"success": false, "error": "failed to load config"})
	}

	provider := notification.BuildProvider(body.Provider, &cfg)
	if provider == nil {
		return c.JSON(http.StatusOK, map[string]any{"success": false, "error": "provider not configured or missing credentials"})
	}

	// Use bot language for test message, fall back to Accept-Language header
	lang := cfg.Bot.Telegram.Language
	if body.Provider == "discord" {
		lang = ""
	}
	if lang == "" {
		lang = c.Request().Header.Get("Accept-Language")
	}
	title, message := testNotificationText(lang)

	testEvent := notification.NotificationEvent{
		Type:     "test",
		Title:    title,
		Message:  message,
		Severity: "info",
	}

	if err := provider.Send(ctx, testEvent); err != nil {
		return c.JSON(http.StatusOK, map[string]any{"success": false, "error": err.Error()})
	}

	return c.JSON(http.StatusOK, map[string]any{"success": true})
}

func (h *handler) handleTestBot(c *echo.Context) error {
	ctx := c.Request().Context()

	var body struct {
		Platform string `json:"platform"` // "telegram" or "discord"
	}
	if err := c.Bind(&body); err != nil || body.Platform == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "platform is required")
	}

	cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"success": false, "error": "failed to load config"})
	}

	client := &http.Client{Timeout: 10 * time.Second}

	switch body.Platform {
	case "telegram":
		token := cfg.Bot.Telegram.BotToken
		if token == "" {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": "bot token not configured"})
		}
		resp, err := client.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token))
		if err != nil {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": err.Error()})
		}
		defer resp.Body.Close()
		var result struct {
			OK          bool   `json:"ok"`
			Description string `json:"description"`
			Result      struct {
				Username string `json:"username"`
			} `json:"result"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		if !result.OK {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": result.Description})
		}
		return c.JSON(http.StatusOK, map[string]any{"success": true, "bot_username": result.Result.Username})

	case "discord":
		token := cfg.Bot.Discord.BotToken
		if token == "" {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": "bot token not configured"})
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://discord.com/api/v10/users/@me", nil)
		req.Header.Set("Authorization", "Bot "+token)
		resp, err := client.Do(req)
		if err != nil {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": err.Error()})
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return c.JSON(http.StatusOK, map[string]any{"success": false, "error": fmt.Sprintf("HTTP %d", resp.StatusCode)})
		}
		var result struct {
			Username string `json:"username"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		return c.JSON(http.StatusOK, map[string]any{"success": true, "bot_username": result.Username})

	default:
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported platform")
	}
}

type providerStatus struct {
	Status     string  `json:"status"`
	LastSentAt *string `json:"last_sent_at"`
	LastError  *string `json:"last_error"`
}

func (h *handler) handleNotificationProviderStatus(c *echo.Context) error {
	ctx := c.Request().Context()

	cfg, err := notification.LoadNotificationConfig(ctx, h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	providers := []struct {
		name    string
		enabled bool
		hasCred bool
	}{
		{"discord", cfg.Providers.Discord.Enabled, cfg.Providers.Discord.WebhookURL != ""},
		{"telegram", cfg.Providers.Telegram.Enabled, cfg.Providers.Telegram.BotToken != ""},
		{"webhook", cfg.Providers.Webhook.Enabled, cfg.Providers.Webhook.URL != ""},
	}

	result := make(map[string]providerStatus, len(providers))

	for _, p := range providers {
		ps := providerStatus{Status: "disabled"}

		if p.enabled && p.hasCred {
			ps.Status = "ok"
		} else if p.enabled && !p.hasCred {
			ps.Status = "misconfigured"
		}

		delivery, err := h.queries.GetLastDeliveryByProvider(ctx, p.name)
		if err == nil {
			ps.LastSentAt = &delivery.UpdatedAt
			if delivery.LastError.Valid {
				ps.LastError = &delivery.LastError.String
			}
			if delivery.Status == "failed" {
				ps.Status = "error"
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return echo.ErrInternalServerError
		}

		result[p.name] = ps
	}

	return c.JSON(http.StatusOK, result)
}

func testNotificationText(lang string) (title, message string) {
	// Normalize: take the first language tag from Accept-Language style strings
	lang = strings.ToLower(strings.TrimSpace(lang))
	if i := strings.IndexAny(lang, ",;"); i > 0 {
		lang = lang[:i]
	}

	switch {
	case strings.Contains(lang, "zh-hk"):
		return "測試通知", "呢個係 milmil 嘅測試通知。"
	case strings.Contains(lang, "zh-tw"):
		return "測試通知", "這是來自 milmil 的測試通知。"
	case strings.Contains(lang, "zh"):
		return "测试通知", "这是来自 milmil 的测试通知。"
	case strings.Contains(lang, "ja"):
		return "テスト通知", "milmil からのテスト通知です。"
	case strings.Contains(lang, "ko"):
		return "테스트 알림", "milmil 테스트 알림입니다."
	default:
		return "Test Notification", "This is a test notification from milmil."
	}
}
