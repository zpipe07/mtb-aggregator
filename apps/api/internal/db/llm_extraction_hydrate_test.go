package db

import (
	"encoding/json"
	"testing"

	"github.com/mtb-aggregator/api/internal/llm"
)

func TestMergeDefOverridesToSchemaField(t *testing.T) {
	def := extractionFieldDefRow{
		FieldKey:    "wheel_size",
		FieldType:   "enum",
		Description: "Wheel size in inches or conventional label.",
		Label:       strPtr("Wheel Size"),
		ValuesJSON:  mustJSON(t, []string{"32", "29", "27.5", "MX", "26", "24", "22", "20", "16", "700c", "650b"}),
		Filterable:  nil,
	}
	overrides := []byte(`{"values":["29","27.5","26","MX"]}`)
	sf, err := mergeDefOverridesToSchemaField(def, overrides, 2)
	if err != nil {
		t.Fatal(err)
	}
	if sf.Key != "wheel_size" || sf.SortOrder != 2 {
		t.Fatalf("key/sort: %+v", sf)
	}
	if len(sf.Values) != 4 || sf.Values[0] != "29" {
		t.Fatalf("overridden values: %v", sf.Values)
	}
}

func TestApplySchemaFieldOverridesLabel(t *testing.T) {
	sf := llm.SchemaField{Key: "x", Type: "string", Description: "base", Label: "Old"}
	if err := applySchemaFieldOverrides(&sf, []byte(`{"label":"New"}`)); err != nil {
		t.Fatal(err)
	}
	if sf.Label != "New" || sf.Description != "base" {
		t.Fatalf("%+v", sf)
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
