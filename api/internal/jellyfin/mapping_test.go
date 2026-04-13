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
	_, _, err := DecodeItemID("not-valid-base64!!!")
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
	_, _, err = DecodeItemID("bm9jb2xvbg==") // "nocolon" — no colon separator
	if err == nil {
		t.Fatal("expected error for missing colon separator")
	}
}
