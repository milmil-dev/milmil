package main

import "testing"

func TestRedactRedisURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"no credentials", "redis://localhost:6379", "redis://localhost:6379"},
		{"user and password", "redis://user:hunter2@localhost:6379", "redis://user:***@localhost:6379"},
		{"password only", "redis://:hunter2@localhost:6379", "redis://:***@localhost:6379"},
		// A password may contain the separators; only the last one splits.
		{"password contains @", "redis://user:pa@ss@localhost:6379", "redis://user:***@localhost:6379"},
		{"password contains colon", "redis://user:pa:ss@localhost:6379", "redis://user:pa:***@localhost:6379"},
		{"no scheme", "user:hunter2@localhost:6379", "user:***@localhost:6379"},
		{"empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := redactRedisURL(tt.in); got != tt.want {
				t.Errorf("redactRedisURL(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
