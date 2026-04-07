package providers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestWebhookProvider_Send(t *testing.T) {
	secret := "test-secret"
	var receivedBody []byte
	var receivedSig string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		receivedSig = r.Header.Get("X-Signature-256")
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := NewWebhookProvider(server.URL, secret, &http.Client{})
	err := p.Send(context.Background(), notification.NotificationEvent{
		Type:     "download.completed",
		Title:    "Download Complete",
		Message:  "Frieren S2E03",
		Severity: "success",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed notification.NotificationEvent
	if err := json.Unmarshal(receivedBody, &parsed); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	if parsed.Type != "download.completed" {
		t.Errorf("expected type download.completed, got %s", parsed.Type)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(receivedBody)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if receivedSig != expected {
		t.Errorf("signature mismatch:\n  got:  %s\n  want: %s", receivedSig, expected)
	}
}

func TestWebhookProvider_SendNoSecret(t *testing.T) {
	var receivedSig string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSig = r.Header.Get("X-Signature-256")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := NewWebhookProvider(server.URL, "", &http.Client{})
	err := p.Send(context.Background(), notification.NotificationEvent{
		Type: "test", Title: "Test", Message: "msg", Severity: "info",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedSig != "" {
		t.Errorf("expected no signature header when secret is empty, got %q", receivedSig)
	}
}

func TestWebhookProvider_Name(t *testing.T) {
	p := NewWebhookProvider("https://example.com", "", &http.Client{})
	if p.Name() != "webhook" {
		t.Errorf("expected 'webhook', got %q", p.Name())
	}
}
