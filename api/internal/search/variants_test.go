package search

import (
	"slices"
	"testing"
)

func TestGenerateVariants_TraditionalInput(t *testing.T) {
	variants := GenerateVariants("進擊的巨人")
	if len(variants) < 2 {
		t.Fatalf("expected at least 2 variants, got %d: %v", len(variants), variants)
	}
	if variants[0] != "進擊的巨人" {
		t.Errorf("first variant should be original, got: %s", variants[0])
	}
	found := slices.Contains(variants, "进击的巨人")
	if !found {
		t.Errorf("expected simplified variant in: %v", variants)
	}
}

func TestGenerateVariants_SimplifiedInput(t *testing.T) {
	variants := GenerateVariants("进击的巨人")
	if len(variants) < 2 {
		t.Fatalf("expected at least 2 variants, got %d: %v", len(variants), variants)
	}
	if variants[0] != "进击的巨人" {
		t.Errorf("first variant should be original, got: %s", variants[0])
	}
	found := slices.Contains(variants, "進擊的巨人")
	if !found {
		t.Errorf("expected traditional variant in: %v", variants)
	}
}

func TestGenerateVariants_LatinInput(t *testing.T) {
	variants := GenerateVariants("Attack on Titan")
	if len(variants) != 1 {
		t.Errorf("expected 1 variant for Latin input, got %d: %v", len(variants), variants)
	}
}

func TestGenerateVariants_MaxThree(t *testing.T) {
	variants := GenerateVariants("龍珠")
	if len(variants) > 3 {
		t.Errorf("expected at most 3 variants, got %d: %v", len(variants), variants)
	}
}

func TestGenerateVariants_Deduplicates(t *testing.T) {
	variants := GenerateVariants("Naruto")
	seen := make(map[string]bool)
	for _, v := range variants {
		if seen[v] {
			t.Errorf("duplicate variant: %s", v)
		}
		seen[v] = true
	}
}
