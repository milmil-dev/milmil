package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

const (
	APITokenPrefix    = "mlml_"
	apiTokenByteLen   = 32
	APITokenPrefixLen = 8 // hex chars stored as token_prefix
)

// GenerateAPIToken creates a new opaque API token and returns the plaintext
// token, its SHA-256 hash, and the display prefix.
func GenerateAPIToken() (plaintext, hash, prefix string, err error) {
	b := make([]byte, apiTokenByteLen)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", fmt.Errorf("generate api token: %w", err)
	}
	hexPart := hex.EncodeToString(b)
	plaintext = APITokenPrefix + hexPart
	hash = HashAPIToken(plaintext)
	prefix = hexPart[:APITokenPrefixLen]
	return plaintext, hash, prefix, nil
}

// HashAPIToken returns the hex-encoded SHA-256 hash of the given token string.
func HashAPIToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// IsAPIToken returns true if the token string starts with the mlml_ prefix.
func IsAPIToken(token string) bool {
	return len(token) > len(APITokenPrefix) && token[:len(APITokenPrefix)] == APITokenPrefix
}
