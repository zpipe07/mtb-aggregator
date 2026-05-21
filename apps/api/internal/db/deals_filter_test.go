package db

import (
	"strings"
	"testing"

	"github.com/lib/pq"
)

func TestBuildFacetsWhereClauseMultiBrand(t *testing.T) {
	p := GetFacetsParams{Brands: []string{"SRAM", "Shimano"}}
	where, args := buildFacetsWhereClause(p, nil, true)
	if !strings.Contains(where, "l.brand ILIKE ANY(") {
		t.Fatalf("expected ILIKE ANY for brands, got: %s", where)
	}
	if len(args) != 1 {
		t.Fatalf("args len want 1, got %d", len(args))
	}
	var elems []string
	switch a := args[0].(type) {
	case pq.StringArray:
		elems = []string(a)
	case *pq.StringArray:
		elems = []string(*a)
	default:
		t.Fatalf("arg type want pq.StringArray or *pq.StringArray, got %T", args[0])
	}
	if len(elems) != 2 || elems[0] != "SRAM" || elems[1] != "Shimano" {
		t.Fatalf("brand array: %v", elems)
	}
}

func TestNormalizeSpecFiltersMap(t *testing.T) {
	m := map[string][]string{
		"wheel_size": {"29", " 27.5 ", ""},
		"empty":      {},
	}
	out := normalizeSpecFiltersMap(m)
	if len(out["wheel_size"]) != 2 || out["wheel_size"][0] != "29" || out["wheel_size"][1] != "27.5" {
		t.Fatalf("wheel_size: %v", out["wheel_size"])
	}
	if _, ok := out["empty"]; ok {
		t.Fatal("empty value list should be omitted")
	}
}

