package api

import "testing"

func TestSafePathSegment(t *testing.T) {
	for _, s := range []string{
		"", ".", "..", "../etc/passwd", "..\\windows", "a/b", "a\\b", "seg\x00ment",
	} {
		if safePathSegment(s) {
			t.Errorf("%q: want refused", s)
		}
	}
	for _, s := range []string{"master.m3u8", "segment-00042.ts", "sprite.jpg", "a1b2c3", "..leading-dots"} {
		if !safePathSegment(s) {
			t.Errorf("%q: want accepted", s)
		}
	}
}
