package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/milmil/api/internal/notification"
)

func init() {
	notification.RegisterProviderFactory("webhook", func(fields map[string]string) notification.Provider {
		return NewWebhookProvider(fields["url"], fields["secret"], &http.Client{Timeout: 10 * time.Second})
	})
}

// WebhookProvider sends notification events as JSON POST requests to a
// user-defined URL. When a secret is configured the request body is signed
// with HMAC-SHA256 and the signature is sent in the X-Signature-256 header.
type WebhookProvider struct {
	url    string
	secret string
	client *http.Client
}

// NewWebhookProvider returns a webhook provider that POSTs events to url.
// If secret is non-empty, each request is signed with HMAC-SHA256.
func NewWebhookProvider(url, secret string, client *http.Client) *WebhookProvider {
	return &WebhookProvider{url: url, secret: secret, client: client}
}

func (w *WebhookProvider) Name() string { return "webhook" }

func (w *WebhookProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("webhook: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("webhook: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if w.secret != "" {
		mac := hmac.New(sha256.New, []byte(w.secret))
		mac.Write(body)
		sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Signature-256", sig)
	}

	resp, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("webhook: unexpected status %d", resp.StatusCode)
	}
	return nil
}
