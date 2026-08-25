package metadata

import (
	"encoding/json"
	"testing"
)

func TestNormalizeClothingSize(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Small", "S"},
		{"S (51-55cm)", "S"},
		{"Medium/Large", "M/L"},
		{"S/M", "S/M"},
		{"One Size", "One Size"},
		{"OSFA", "One Size"},
		{"Uni-size (55-61 cm)", "One Size"},
		{"Youth", "Kids"},
		{"Junior #XS (50-54cm)", "Kids"},
		{"32 in", "32"},
		{`32"`, "32"},
		{"32", "32"},
		{"8", "8"},
		{"X-Large", "XL"},
		{"2X-Large", "XXL"},
		{"3X-Large", "3XL"},
		{"UY", ""},
		{"UA", ""},
		{"S, M, L", ""},
	}
	for _, tc := range tests {
		got := NormalizeClothingSize(tc.in)
		if got != tc.want {
			t.Errorf("NormalizeClothingSize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestApplyClothingSizeFromVariant_respectsOverride(t *testing.T) {
	existing := []byte(`{"llm_overrides":{"clothing_size":"L"},"llm_specs":{"clothing_size":"M"}}`)
	variant := []byte(`{"Size":"Small"}`)
	got := ApplyClothingSizeFromVariant(existing, variant)
	if string(got) != string(existing) {
		t.Fatalf("override should block copy: got %s", got)
	}
}

func TestApplyClothingSizeFromVariant_setsNormalized(t *testing.T) {
	existing := []byte(`{}`)
	variant := []byte(`{"Size":"Medium"}`)
	got := ApplyClothingSizeFromVariant(existing, variant)
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["clothing_size"] != "M" {
		t.Fatalf("clothing_size = %v", specs["clothing_size"])
	}
}
