package crypto_test

import (
	"testing"

	"github.com/milmil/api/internal/crypto"
)

func TestEncryptDecrypt(t *testing.T) {
	key := crypto.DeriveKey("test-secret")
	plaintext := "my-super-secret-credential"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if ciphertext == plaintext {
		t.Fatal("ciphertext must differ from plaintext")
	}

	got, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if got != plaintext {
		t.Fatalf("roundtrip mismatch: got %q, want %q", got, plaintext)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key := crypto.DeriveKey("correct-secret")
	plaintext := "sensitive-data"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	wrongKey := crypto.DeriveKey("wrong-secret")
	_, err = crypto.Decrypt(wrongKey, ciphertext)
	if err == nil {
		t.Fatal("Decrypt with wrong key should have failed")
	}
}
