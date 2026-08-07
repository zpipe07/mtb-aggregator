package db

import (
	"testing"

	"github.com/mtb-aggregator/api/internal/llm"
)

func TestMergeInheritedSchemaFields_rootThenLeafNoOverlap(t *testing.T) {
	tiers := [][]llm.SchemaField{
		{
			{Key: "wheel_size", Type: "enum", Description: "w", SortOrder: 1},
			{Key: "frame_material", Type: "string", Description: "f", SortOrder: 2},
		},
		nil,
		{
			{Key: "rear_travel", Type: "string", Description: "r", SortOrder: 1},
		},
	}
	got, err := mergeInheritedSchemaFields(tiers)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("len %d, want 3: %+v", len(got), keysOf(got))
	}
	assertFieldOrder(t, got, []string{"wheel_size", "frame_material", "rear_travel"})
	if got[0].SortOrder != 1 || got[2].SortOrder != 3 {
		t.Fatalf("sort orders: %+v", got)
	}
}

func TestMergeInheritedSchemaFields_childOverridesParentKey(t *testing.T) {
	tiers := [][]llm.SchemaField{
		{
			{Key: "wheel_size", Type: "enum", Description: "parent", SortOrder: 10},
			{Key: "frame_material", Type: "string", Description: "frame", SortOrder: 20},
		},
		{
			{Key: "wheel_size", Type: "enum", Description: "child", SortOrder: 5},
		},
	}
	got, err := mergeInheritedSchemaFields(tiers)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("len %d want 2: %+v", len(got), keysOf(got))
	}
	assertFieldOrder(t, got, []string{"frame_material", "wheel_size"})
	if got[1].Description != "child" {
		t.Fatalf("want child wheel desc, got %q", got[1].Description)
	}
}

func TestMergeInheritedSchemaFields_skipsConfidenceInTiers(t *testing.T) {
	tiers := [][]llm.SchemaField{
		{{Key: "a", Type: "string", Description: "a", SortOrder: 1}},
		{{Key: "confidence", Type: "number", Description: "c", SortOrder: 99}},
	}
	got, err := mergeInheritedSchemaFields(tiers)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Key != "a" {
		t.Fatalf("got %+v", keysOf(got))
	}
}

func TestMergeInheritedSchemaFields_rejectsEmptyKey(t *testing.T) {
	_, err := mergeInheritedSchemaFields([][]llm.SchemaField{
		{{Key: "", Type: "string", Description: "x", SortOrder: 1}},
	})
	if err == nil {
		t.Fatal("expected error")
	}
}

func keysOf(fields []llm.SchemaField) []string {
	var s []string
	for _, f := range fields {
		s = append(s, f.Key)
	}
	return s
}

func assertFieldOrder(t *testing.T, fields []llm.SchemaField, want []string) {
	t.Helper()
	if len(fields) != len(want) {
		t.Fatalf("len %d want %d: got %v", len(fields), len(want), keysOf(fields))
	}
	for i := range want {
		if fields[i].Key != want[i] {
			t.Fatalf("index %d: got %q want %q (full %v)", i, fields[i].Key, want[i], keysOf(fields))
		}
	}
}
