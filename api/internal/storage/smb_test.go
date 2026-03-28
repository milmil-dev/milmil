package storage

import (
	"testing"
)

func TestRcloneSMB_MissingHost(t *testing.T) {
	_, err := NewRcloneProvider("smb", `{"share": "media"}`)
	if err == nil {
		t.Fatal("expected error for missing host")
	}
}

func TestRcloneSMB_MissingShare(t *testing.T) {
	_, err := NewRcloneProvider("smb", `{"host": "192.168.1.100"}`)
	if err == nil {
		t.Fatal("expected error for missing share")
	}
}

func TestBuildRemoteString_SMB(t *testing.T) {
	cfg := RcloneConfig{
		Host:     "192.168.50.203",
		Port:     445,
		Share:    "Media",
		Username: "user",
		Password: "pass",
		Domain:   "WORKGROUP",
	}
	remote, err := buildRemoteString("smb", cfg)
	if err != nil {
		t.Fatal(err)
	}
	// Should contain the backend type and host.
	if remote == "" {
		t.Fatal("expected non-empty remote string")
	}
	// Verify it starts with the expected prefix.
	expected := ":smb,"
	if len(remote) < len(expected) || remote[:len(expected)] != expected {
		t.Fatalf("expected remote to start with %q, got %q", expected, remote)
	}
}
