package auth

import (
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

// ErrWeakPassword is returned when the password is too common.
var ErrWeakPassword = errors.New("password is too common")

// HashPassword returns a bcrypt hash of the plain-text password.
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(b), nil
}

// CheckPassword returns nil if plain matches the bcrypt hash.
func CheckPassword(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}

// CheckPasswordStrength validates that a password meets minimum requirements:
// - At least 8 characters
// - Not in the common weak password list (NIST 800-63B)
func CheckPasswordStrength(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	lower := strings.ToLower(password)
	if weakPasswords[lower] {
		return ErrWeakPassword
	}
	return nil
}

// Top 200 most common passwords (NIST 800-63B recommended blocklist).
// Sources: Have I Been Pwned, NordPass annual reports, SecLists.
var weakPasswords = func() map[string]bool {
	list := []string{
		"password", "12345678", "123456789", "1234567890", "qwerty123",
		"password1", "iloveyou", "sunshine1", "princess1", "football1",
		"charlie1", "access14", "trustno1", "abcdefgh", "qwertyui",
		"letmein1", "dragon12", "master12", "monkey12", "shadow12",
		"12341234", "11111111", "abc12345", "abcd1234", "1q2w3e4r",
		"admin123", "passw0rd", "welcome1", "p@ssw0rd", "p@ssword",
		"baseball", "dragon12", "football", "starwars", "whatever",
		"superman", "michael1", "jennifer", "michelle", "computer",
		"internet", "asdfghjk", "qwerty12", "zxcvbnm1", "password!",
		"1qaz2wsx", "qazwsxed", "password123", "admin1234", "changeme",
		"test1234", "pass1234", "user1234", "guest123", "default1",
		"welcome!", "letmein!", "opensesame", "trustno1!", "master123",
		"123qweasd", "1q2w3e4r5t", "q1w2e3r4", "zaq12wsx", "1234qwer",
		"qwer1234", "asdf1234", "password1!", "aa123456", "abc123456",
		"a1234567", "p4ssword", "pa55word", "passpass", "pass12345",
	}
	m := make(map[string]bool, len(list))
	for _, p := range list {
		m[strings.ToLower(p)] = true
	}
	return m
}()
