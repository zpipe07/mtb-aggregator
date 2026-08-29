package db

import (
	"testing"
)

func TestLLMPathAllowedForBikesOnlineRepair(t *testing.T) {
	t.Parallel()
	allowed := [][]string{
		{"Gear", "Protection"},
		{"Gear", "Helmets"},
		{"Gear", "Gloves"},
	}
	for _, path := range allowed {
		if !llmPathAllowedForBikesOnlineRepair(path) {
			t.Fatalf("expected allowed: %v", path)
		}
	}
	rejected := [][]string{
		{"Gear", "Clothing"},
		{"Gear", "Clothing", "Tops", "Jerseys"},
		{"Gear"},
		{"Gear", "Clothing", "Jerseys"},
		{"Accessories", "Lights"},
	}
	for _, path := range rejected {
		if llmPathAllowedForBikesOnlineRepair(path) {
			t.Fatalf("expected rejected: %v", path)
		}
	}
}

func TestShouldPreserveCanonicalForBackfill(t *testing.T) {
	t.Parallel()
	threshold := 0.9

	metaManual := []byte(`{"manual_category_override":true,"llm_category":{"canonical_category":["Gear","Protection"],"confidence":0.95}}`)
	if !ShouldPreserveCanonicalForBackfill(metaManual, threshold) {
		t.Fatal("manual override should preserve")
	}

	metaConfident := []byte(`{"llm_category":{"canonical_category":["Gear","Protection"],"confidence":0.95}}`)
	if !ShouldPreserveCanonicalForBackfill(metaConfident, threshold) {
		t.Fatal("confident LLM should preserve")
	}

	metaLowConf := []byte(`{"llm_category":{"canonical_category":["Gear","Protection"],"confidence":0.5}}`)
	if ShouldPreserveCanonicalForBackfill(metaLowConf, threshold) {
		t.Fatal("low confidence should not preserve")
	}

	metaNoLLM := []byte(`{"specs":{"color":"black"}}`)
	if ShouldPreserveCanonicalForBackfill(metaNoLLM, threshold) {
		t.Fatal("missing llm_category should not preserve")
	}
}
