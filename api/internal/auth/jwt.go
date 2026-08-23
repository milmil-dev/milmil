package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const tokenTTL = 24 * time.Hour

type Claims struct {
	UserID string `json:"sub"`
	// TokenVersion mirrors users.token_version at signing time. A JWT cannot be
	// deleted server-side, so this is what makes one revocable: bumping the
	// column invalidates every token already handed out for that user.
	TokenVersion int64 `json:"tv"`
	jwt.RegisteredClaims
}

// SignToken creates a signed JWT for the given userID at the given token version.
func SignToken(secret, userID string, tokenVersion int64) (string, error) {
	claims := Claims{
		UserID:       userID,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// VerifyToken validates the JWT and returns the userID (sub claim) together
// with the token version it was signed at. Callers must compare that version
// against the user's current one before trusting the token.
func VerifyToken(secret, tokenStr string) (string, int64, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return "", 0, fmt.Errorf("parse token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return "", 0, fmt.Errorf("invalid token claims")
	}
	return claims.UserID, claims.TokenVersion, nil
}
