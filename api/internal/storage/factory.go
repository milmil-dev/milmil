package storage

import (
	"fmt"
)

// NewProvider creates a storage provider based on source type and config JSON.
func NewProvider(sourceType string, configJSON string) (Provider, error) {
	switch sourceType {
	case "local", "":
		return NewLocalProvider(), nil
	default:
		return nil, fmt.Errorf("unsupported source type: %s", sourceType)
	}
}
