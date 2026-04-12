package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestDiscordProvider_Send(t *testing.T) {
	var receivedBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected application/json content type")
		}
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	p := NewDiscordProvider(server.URL, &http.Client{})
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
	if receivedBody == nil {
		t.Fatal("no body received")
	}
	embeds, ok := receivedBody["embeds"].([]any)
	if !ok || len(embeds) == 0 {
		t.Fatal("expected embeds array")
	}
}

func TestDiscordProvider_Name(t *testing.T) {
	p := NewDiscordProvider("https://example.com", &http.Client{})
	if p.Name() != "discord" {
		t.Errorf("expected 'discord', got %q", p.Name())
	}
}
