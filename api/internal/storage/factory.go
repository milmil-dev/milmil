package storage

import (
	"encoding/json"
	"fmt"
)

// NewProvider creates a storage provider based on source type and config JSON.
func NewProvider(sourceType string, configJSON string) (Provider, error) {
	switch sourceType {
	case "local", "":
		return NewLocalProvider(), nil
	case "sftp":
		var cfg SFTPConfig
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return nil, fmt.Errorf("invalid sftp config: %w", err)
		}
		return NewSFTPProvider(cfg)
	case "smb":
		var cfg SMBConfig
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return nil, fmt.Errorf("invalid smb config: %w", err)
		}
		return NewSMBProvider(cfg)
	default:
		return nil, fmt.Errorf("unsupported source type: %s", sourceType)
	}
}
