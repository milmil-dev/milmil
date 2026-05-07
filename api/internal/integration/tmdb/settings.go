package tmdb

import (
	"encoding/json"
	"strings"
)

type Settings struct {
	APIKey      string `json:"api_key"`
	AccessToken string `json:"access_token"`
}

type Auth struct {
	APIKey      string
	AccessToken string
}

func APIKeyFromSetting(value string) string {
	return AuthFromSetting(value).APIKey
}

func AuthFromSetting(value string) Auth {
	value = strings.TrimSpace(value)
	if value == "" || value == "{}" {
		return Auth{}
	}

	var settings Settings
	if err := json.Unmarshal([]byte(value), &settings); err == nil {
		return Auth{
			APIKey:      strings.TrimSpace(settings.APIKey),
			AccessToken: strings.TrimSpace(settings.AccessToken),
		}
	}

	var legacy string
	if err := json.Unmarshal([]byte(value), &legacy); err == nil {
		return Auth{APIKey: strings.TrimSpace(legacy)}
	}

	return Auth{APIKey: value}
}
