package api

import "testing"

func TestSanitizeTimestamp(t *testing.T) {
	cases := []struct {
		name string
		in   string
		ok   bool
	}{
		{name: "rfc3339", in: "2026-01-02T15:04:05Z", ok: true},
		{name: "offset", in: "2026-01-02T15:04:05+08:00", ok: true},
		{name: "space", in: "2026-01-02 15:04:05", ok: true},
		{name: "date-only", in: "2026-01-02", ok: true},
		{name: "invalid", in: "not-a-date", ok: false},
		{name: "empty", in: "", ok: false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := sanitizeTimestamp(c.in)
			if ok != c.ok {
				t.Fatalf("expected ok=%v, got %v, result=%q", c.ok, ok, got)
			}
			if ok && got == "" {
				t.Fatalf("expected non-empty value when ok")
			}
		})
	}
}
