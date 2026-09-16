package metadata

import (
	"encoding/json"
	"reflect"
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
		{"Small/Medium", "S/M"},
		{"Large / Extra Large", "L/XL"},
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
		{"Extra Large", "XL"},
		{"Extra Small", "XS"},
		{"XX-Large", "XXL"},
		{"2X-Large", "XXL"},
		{"2X", "XXL"},
		{"3X-Large", "3XL"},
		{"XXX-Large", "3XL"},
		{"US XL/EU XXL", "XL"},
		{"US S/EU M", "S"},
		{"UY", ""},
		{"UA", ""},
		{"S, M, L", ""},
		{"null", ""},
	}
	for _, tc := range tests {
		got := NormalizeClothingSize(tc.in)
		if got != tc.want {
			t.Errorf("NormalizeClothingSize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeClothingSizes_splitsSizeRuns(t *testing.T) {
	tests := []struct {
		in   string
		want []string
	}{
		{"S, M, L, XL", []string{"S", "M", "L", "XL"}},
		{"Small, Medium, Large, Extra Large, XX-Large", []string{"S", "M", "L", "XL", "XXL"}},
		{"Small, Medium, Large, Extra Large, XX-Large, XXX-Large", []string{"S", "M", "L", "XL", "XXL", "3XL"}},
		{"28, 30, 32, 34, 36, 38, 40", []string{"28", "30", "32", "34", "36", "38", "40"}},
		{"24, 26, 28", []string{"24", "26", "28"}},
		{"2, 4, 6, 8, 10, 12", []string{"2", "4", "6", "8", "10", "12"}},
		{"Small/Medium, Large/Extra Large", []string{"S/M", "L/XL"}},
		{"S/M, L/XL", []string{"S/M", "L/XL"}},
		{"Extra Small / Small / Medium / Large / Extra Large / XX-Large / XXX-Large", []string{"XS", "S", "M", "L", "XL", "XXL", "3XL"}},
		{"7 - 8 (S), 9 - 10 (M), 11 - 12 (L)", []string{"S", "M", "L"}},
		{"M", []string{"M"}},
		{"S, M, L", []string{"S", "M", "L"}},
		{"T, UC", nil},
		{"", nil},
		{"null", nil},
	}
	for _, tc := range tests {
		got := NormalizeClothingSizes(tc.in)
		if len(got) == 0 && len(tc.want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("NormalizeClothingSizes(%q) = %#v, want %#v", tc.in, got, tc.want)
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

func TestApplyClothingSizeFromVariant_splitsStoredSizeRun(t *testing.T) {
	existing := []byte(`{"llm_specs":{"clothing_size":"S, M, L, XL"}}`)
	got := ApplyClothingSizeFromVariant(existing, []byte(`{"Color":"Black"}`))
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	gotSizes, ok := specs["clothing_size"].([]interface{})
	if !ok {
		t.Fatalf("expected array, got %T %v", specs["clothing_size"], specs["clothing_size"])
	}
	want := []string{"S", "M", "L", "XL"}
	if len(gotSizes) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(gotSizes), len(want), gotSizes)
	}
	for i, w := range want {
		if gotSizes[i] != w {
			t.Fatalf("sizes[%d] = %v, want %s", i, gotSizes[i], w)
		}
	}
}

func TestApplyClothingSizeFromVariant_variantWinsOverSizeRun(t *testing.T) {
	existing := []byte(`{"llm_specs":{"clothing_size":"S, M, L, XL"}}`)
	got := ApplyClothingSizeFromVariant(existing, []byte(`{"Size":"Large"}`))
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["clothing_size"] != "L" {
		t.Fatalf("clothing_size = %v, want L", specs["clothing_size"])
	}
}

func TestApplyClothingSizeFromVariant_clearsNullString(t *testing.T) {
	existing := []byte(`{"llm_specs":{"clothing_size":"null","intended_use":["Trail"]}}`)
	got := ApplyClothingSizeFromVariant(existing, nil)
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if _, ok := specs["clothing_size"]; ok {
		t.Fatalf("clothing_size should be removed, got %v", specs["clothing_size"])
	}
	uses, _ := specs["intended_use"].([]interface{})
	if len(uses) != 1 || uses[0] != "Trail" {
		t.Fatalf("intended_use = %v", specs["intended_use"])
	}
}

func TestApplyClothingSizeFromVariant_normalizesWordSize(t *testing.T) {
	existing := []byte(`{"llm_specs":{"clothing_size":"Extra Small"}}`)
	got := ApplyClothingSizeFromVariant(existing, nil)
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["clothing_size"] != "XS" {
		t.Fatalf("clothing_size = %v, want XS", specs["clothing_size"])
	}
}
