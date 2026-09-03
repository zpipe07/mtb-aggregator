package metadata

import (
	"encoding/json"
	"testing"
)

func TestNormalizeBikeSize(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Small", "S"},
		{"Medium", "M"},
		{"Large", "L"},
		{"X-Large", "XL"},
		{"XXL", "XXL"},
		{"XS", "XS"},
		{"S2", "S2"},
		{"s 4", "S4"},
		{"17\"", "17"},
		{"15 in", "15"},
		{"19", "19"},
		{"17.5", "17.5"},
		{"29", ""},
		{"27.5", ""},
		{"MX", ""},
		{"S, M, L", ""},
		{"One Size", ""},
		{"", ""},
	}
	for _, tc := range tests {
		got := NormalizeBikeSize(tc.in)
		if got != tc.want {
			t.Errorf("NormalizeBikeSize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestVariantBikeSizeFromOptions(t *testing.T) {
	if got := VariantBikeSizeFromOptions([]byte(`{"Bike Size":"Medium","Color":"Sage"}`)); got != "Medium" {
		t.Fatalf("Bike Size = %q", got)
	}
	if got := VariantBikeSizeFromOptions([]byte(`{"Size":"XL"}`)); got != "XL" {
		t.Fatalf("Size = %q", got)
	}
	if got := VariantBikeSizeFromOptions([]byte(`{"Color":"Black"}`)); got != "" {
		t.Fatalf("no size key should be empty, got %q", got)
	}
}

func TestApplyBikeSizeFromVariant_respectsOverride(t *testing.T) {
	existing := []byte(`{"llm_overrides":{"bike_size":"L"},"llm_specs":{"bike_size":"M"}}`)
	variant := []byte(`{"Size":"Small"}`)
	got := ApplyBikeSizeFromVariant(existing, variant)
	if string(got) != string(existing) {
		t.Fatalf("override should block copy: got %s", got)
	}
}

func TestApplyBikeSizeFromVariant_setsNormalized(t *testing.T) {
	got := ApplyBikeSizeFromVariant([]byte(`{}`), []byte(`{"Frame Size":"Medium"}`))
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["bike_size"] != "M" {
		t.Fatalf("bike_size = %v", specs["bike_size"])
	}
}
