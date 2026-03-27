package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSFTPConfig_Defaults(t *testing.T) {
	cfg := SFTPConfig{
		Host:     "192.168.1.100",
		Username: "media",
		Password: "secret",
	}

	assert.Equal(t, "192.168.1.100", cfg.Host)
	assert.Equal(t, 0, cfg.Port) // zero value; NewSFTPProvider defaults to 22
	assert.Equal(t, "media", cfg.Username)
	assert.Equal(t, "secret", cfg.Password)
	assert.Empty(t, cfg.PrivateKey)
}

func TestNewSFTPProvider_NoAuth(t *testing.T) {
	cfg := SFTPConfig{
		Host:     "localhost",
		Username: "user",
	}

	_, err := NewSFTPProvider(cfg)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no authentication method provided")
}
