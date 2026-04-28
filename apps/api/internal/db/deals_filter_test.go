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

func TestAppendVariantFiltersMultiValueUsesAny(t *testing.T) {
	var sb strings.Builder
	args := []interface{}{}
	argNum := 1
	filters := map[string][]string{"Size": {"M", "L"}}
	appendVariantFilters(&sb, &args, &argNum, filters)
	sql := sb.String()
	if !strings.Contains(sql, "ILIKE ANY(") {
		t.Fatalf("expected ILIKE ANY for multi variant value: %s", sql)
	}
	if len(args) != 2 {
		t.Fatalf("args len want 2, got %d", len(args))
	}
	if args[0] != "Size" {
		t.Fatalf("first arg want Size, got %v", args[0])
	}
}

func TestAppendVariantFiltersSingleValue(t *testing.T) {
	var sb strings.Builder
	args := []interface{}{}
	argNum := 1
	appendVariantFilters(&sb, &args, &argNum, map[string][]string{"Size": {"M"}})
	if strings.Contains(sb.String(), "ILIKE ANY(") {
		t.Fatal("single value should use ILIKE not ANY")
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

func TestVariantFiltersOmitMulti(t *testing.T) {
	in := map[string][]string{"Size": {"M"}, "Color": {"Red"}}
	out := variantFiltersOmitMulti(in, "size")
	if len(out) != 1 || len(out["Color"]) != 1 {
		t.Fatalf("omit Size: %v", out)
	}
	// no-op when key missing
	same := variantFiltersOmitMulti(in, "Width")
	if len(same) != 2 {
		t.Fatalf("expected same map reference behavior, got len %d", len(same))
	}
}
