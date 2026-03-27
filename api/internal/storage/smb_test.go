package storage

import (
	"testing"
)

func TestSMBConfig_Defaults(t *testing.T) {
	cfg := SMBConfig{
		Host:  "192.168.1.100",
		Share: "media",
	}
	if cfg.Host != "192.168.1.100" {
		t.Fatalf("expected host 192.168.1.100, got %s", cfg.Host)
	}
	if cfg.Share != "media" {
		t.Fatalf("expected share media, got %s", cfg.Share)
	}
	if cfg.Port != 0 {
		t.Fatalf("expected zero-value port (default handled by constructor), got %d", cfg.Port)
	}
}

func TestNewSMBProvider_MissingHost(t *testing.T) {
	_, err := NewSMBProvider(SMBConfig{Share: "media"})
	if err == nil {
		t.Fatal("expected error for missing host")
	}
}

func TestNewSMBProvider_MissingShare(t *testing.T) {
	_, err := NewSMBProvider(SMBConfig{Host: "192.168.1.100"})
	if err == nil {
		t.Fatal("expected error for missing share")
	}
}
