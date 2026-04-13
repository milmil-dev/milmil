package jellyfin

import "testing"

func TestEncodeDecodeItemID(t *testing.T) {
	tests := []struct {
		typ string
		id  string
	}{
		{"anime", "abc123"},
		{"episode", "def-456"},
		{"file", "ghi789"},
		{"library", "lib-001"},
	}
	for _, tt := range tests {
		encoded := EncodeItemID(tt.typ, tt.id)
		if encoded == "" {
			t.Fatalf("EncodeItemID(%q, %q) returned empty", tt.typ, tt.id)
		}
		gotType, gotID, err := DecodeItemID(encoded)
		if err != nil {
			t.Fatalf("DecodeItemID(%q): %v", encoded, err)
		}
		if gotType != tt.typ || gotID != tt.id {
			t.Errorf("roundtrip failed: got (%q, %q), want (%q, %q)", gotType, gotID, tt.typ, tt.id)
		}
	}
}

func TestDecodeItemID_Invalid(t *testing.T) {
	_, _, err := DecodeItemID("unknown_id_that_was_never_encoded")
	if err == nil {
		t.Fatal("expected error for unknown id")
	}
}

func TestEncodeItemID_FixedLength32(t *testing.T) {
	encoded := EncodeItemID("anime", "abc123")
	if len(encoded) != 32 {
		t.Fatalf("encoded ID length = %d, want 32 (GUID format). Value: %s", len(encoded), encoded)
	}
	// Should be valid hex
	for _, c := range encoded {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Fatalf("encoded ID contains non-hex char: %c in %s", c, encoded)
		}
	}
}

func TestEncodeItemID_Deterministic(t *testing.T) {
	a := EncodeItemID("anime", "test-id")
	b := EncodeItemID("anime", "test-id")
	if a != b {
		t.Fatalf("encoding not deterministic: %s != %s", a, b)
	}
}
