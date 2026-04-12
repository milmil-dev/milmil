package notification

import "context"

// NotificationEvent is the payload passed to external notification providers.
type NotificationEvent struct {
	Type     string            `json:"type"`
	Title    string            `json:"title"`
	Message  string            `json:"message"`
	Severity string            `json:"severity"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Provider delivers notifications to an external service (Discord, Telegram, etc.).
type Provider interface {
	Name() string
	Send(ctx context.Context, event NotificationEvent) error
}
