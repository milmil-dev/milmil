package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestTelegramProvider_Send(t *testing.T) {
	var receivedBody map[string]any
	var receivedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	p := NewTelegramProvider("testtoken123", "12345", &http.Client{})
	p.baseURL = server.URL

	err := p.Send(context.Background(), notification.NotificationEvent{
		Type:     "download.completed",
		Title:    "Download Complete",
		Message:  "Frieren S2E03",
		Severity: "success",
		Metadata: map[string]string{"rule_name": "Frieren Auto"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedPath != "/bottesttoken123/sendMessage" {
		t.Errorf("unexpected path: %s", receivedPath)
	}
	chatID, _ := receivedBody["chat_id"].(string)
	if chatID != "12345" {
		t.Errorf("expected chat_id '12345', got %q", chatID)
	}
	parseMode, _ := receivedBody["parse_mode"].(string)
	if parseMode != "HTML" {
		t.Errorf("expected parse_mode 'HTML', got %q", parseMode)
	}
}

func TestTelegramProvider_Name(t *testing.T) {
	p := NewTelegramProvider("token", "chat", &http.Client{})
	if p.Name() != "telegram" {
		t.Errorf("expected 'telegram', got %q", p.Name())
	}
}
