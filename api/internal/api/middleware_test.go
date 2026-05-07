package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRedactSensitiveFields_RedactsTopLevelCredentials(t *testing.T) {
	cases := []struct {
		name string
		in   string
		bad  []string
	}{
		{
			name: "tmdb settings body",
			in:   `{"api_key":"tmdb-key","access_token":"tmdb-bearer"}`,
			bad:  []string{"tmdb-key", "tmdb-bearer"},
		},
		{
			name: "dandanplay settings body",
			in:   `{"app_id":"id-123","app_secret":"secret-xyz"}`,
			bad:  []string{"secret-xyz"},
		},
		{
			name: "oauth client creds body",
			in:   `{"client_id":"cid","client_secret":"csec"}`,
			bad:  []string{"csec"},
		},
		{
			name: "trakt token body",
			in:   `{"refresh_token":"r-tok","access_token":"a-tok"}`,
			bad:  []string{"r-tok", "a-tok"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := redactSensitiveFields(tc.in)
			for _, b := range tc.bad {
				if strings.Contains(got, b) {
					t.Errorf("expected %q to be redacted from output, got: %s", b, got)
				}
			}
			if !strings.Contains(got, "[REDACTED]") {
				t.Errorf("expected [REDACTED] marker in output, got: %s", got)
			}
		})
	}
}

func TestRedactSensitiveFields_RedactsNestedCredentials(t *testing.T) {
	in := `{"source_type":"smb","source_config":{"smb_host":"x","smb_username":"u","smb_password":"p-secret"}}`
	got := redactSensitiveFields(in)
	if strings.Contains(got, "p-secret") {
		t.Errorf("nested smb_password leaked: %s", got)
	}
	if !strings.Contains(got, `"smb_username":"u"`) {
		t.Errorf("non-sensitive smb_username should pass through: %s", got)
	}
}

func TestRedactSensitiveFields_PreservesNonSensitiveIDFields(t *testing.T) {
	in := `{"library_id":"lib-1","anime_id":"a-1","user_id":"u-1"}`
	got := redactSensitiveFields(in)
	if strings.Contains(got, "[REDACTED]") {
		t.Errorf("expected no redaction for *_id fields, got: %s", got)
	}
}

func TestRedactSensitiveFields_HandlesArrays(t *testing.T) {
	in := `{"items":[{"name":"a","api_key":"k1"},{"name":"b","api_key":"k2"}]}`
	got := redactSensitiveFields(in)
	if strings.Contains(got, "k1") || strings.Contains(got, "k2") {
		t.Errorf("api_key inside array elements leaked: %s", got)
	}
}

func TestRedactSensitiveFields_PassesThroughInvalidJSON(t *testing.T) {
	in := "not json at all"
	got := redactSensitiveFields(in)
	if got != in {
		t.Errorf("invalid JSON should pass through unchanged, got: %s", got)
	}
}

func TestRedactSensitiveFields_KeepsEmptyValuesVisible(t *testing.T) {
	// Empty/null values are useful for "is the field configured" debugging.
	in := `{"api_key":"","access_token":null}`
	got := redactSensitiveFields(in)
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(got), &m); err != nil {
		t.Fatalf("output not valid JSON: %v", err)
	}
	if string(m["api_key"]) != `""` {
		t.Errorf("empty string should not be redacted, got: %s", m["api_key"])
	}
	if string(m["access_token"]) != `null` {
		t.Errorf("null should not be redacted, got: %s", m["access_token"])
	}
}

func TestIsSensitiveKey(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		{"password", true},
		{"PASSWORD", true},
		{"api_key", true},
		{"smb_password", true},
		{"webdav_password", true},
		{"refresh_token", true},
		{"client_secret", true},
		{"api_id", false},
		{"library_id", false},
		{"user_id", false},
		{"name", false},
		{"app_id", true}, // explicit in sensitiveFields
	}
	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			if got := isSensitiveKey(tc.key); got != tc.want {
				t.Errorf("isSensitiveKey(%q) = %v, want %v", tc.key, got, tc.want)
			}
		})
	}
}
