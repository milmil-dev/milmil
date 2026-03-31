package cache

import "testing"

func TestCacheKeyMeta(t *testing.T) {
	ns, sig, keyLen := cacheKeyMeta("meta:search:frieren")
	if ns != "meta:search" {
		t.Fatalf("namespace mismatch: got %q", ns)
	}
	if sig == "" {
		t.Fatalf("signature should not be empty")
	}
	if keyLen != 19 {
		t.Fatalf("unexpected key length: got %d", keyLen)
	}
}

func TestCacheKeyMeta_ShortKey(t *testing.T) {
	ns, sig, keyLen := cacheKeyMeta("single")
	if ns != "single" {
		t.Fatalf("namespace mismatch: got %q", ns)
	}
	if sig == "" {
		t.Fatalf("signature should not be empty")
	}
	if keyLen != 6 {
		t.Fatalf("unexpected key length: got %d", keyLen)
	}
}
