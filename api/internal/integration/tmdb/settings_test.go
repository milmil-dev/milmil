package tmdb

import "testing"

func TestAPIKeyFromSettingParsesObject(t *testing.T) {
	got := APIKeyFromSetting(`{"api_key":"tmdb-object-key"}`)
	if got != "tmdb-object-key" {
		t.Fatalf("want tmdb-object-key, got %q", got)
	}
}

func TestAuthFromSettingPrefersAccessToken(t *testing.T) {
	got := AuthFromSetting(`{"api_key":"tmdb-object-key","access_token":"tmdb-access-token"}`)
	if got.AccessToken != "tmdb-access-token" {
		t.Fatalf("want access token, got %q", got.AccessToken)
	}
	if got.APIKey != "tmdb-object-key" {
		t.Fatalf("want api key preserved, got %q", got.APIKey)
	}
}

func TestAPIKeyFromSettingParsesLegacyJSONString(t *testing.T) {
	got := APIKeyFromSetting(`"tmdb-json-string-key"`)
	if got != "tmdb-json-string-key" {
		t.Fatalf("want tmdb-json-string-key, got %q", got)
	}
}

func TestAPIKeyFromSettingParsesLegacyPlainString(t *testing.T) {
	got := APIKeyFromSetting(`tmdb-plain-key`)
	if got != "tmdb-plain-key" {
		t.Fatalf("want tmdb-plain-key, got %q", got)
	}
}
