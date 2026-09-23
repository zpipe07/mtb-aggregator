package db

import (
	"context"
	"strings"
	"testing"

	"github.com/lib/pq"
)

func TestEffectiveLLMSpecsExpr_mergesOverrides(t *testing.T) {
	got := effectiveLLMSpecsExpr("l.metadata")
	if !strings.Contains(got, "llm_specs") || !strings.Contains(got, "llm_overrides") || !strings.Contains(got, "||") {
		t.Fatalf("expected specs || overrides merge, got %q", got)
	}
}

func TestAppendMetadataSpecFilterConditions_usesEffectiveSpecs(t *testing.T) {
	var sb strings.Builder
	args := []interface{}{}
	argNum := 1
	appendMetadataSpecFilterConditions(&sb, &args, &argNum, map[string][]string{"coverage": {"Half shell"}}, true)
	sql := sb.String()
	if !strings.Contains(sql, "llm_overrides") {
		t.Fatalf("LLM spec filter should read overrides, got %q", sql)
	}
	if len(args) != 2 || args[0] != "coverage" || args[1] != "Half shell" {
		t.Fatalf("args = %#v", args)
	}
}

func TestFacetProductGroupKeyMatchesGroupedDeals(t *testing.T) {
	got := facetProductGroupKeySQL("l")
	want := `COALESCE(l.product_group_key, 'single:' || l.id::text)`
	if got != want {
		t.Fatalf("facetProductGroupKeySQL = %q, want %q", got, want)
	}
	count := facetDistinctGroupCountSQL("l")
	if count != "COUNT(DISTINCT "+want+")::int" {
		t.Fatalf("facetDistinctGroupCountSQL = %q", count)
	}
	// Unaliased form used by public store deal_count.
	if storeVisibleProductGroupKey != `COALESCE(product_group_key, 'single:' || id::text)` {
		t.Fatalf("storeVisibleProductGroupKey drifted: %q", storeVisibleProductGroupKey)
	}
}

func stringArgs(args []interface{}) []string {
	var out []string
	for _, a := range args {
		switch v := a.(type) {
		case string:
			out = append(out, v)
		case *pq.StringArray:
			out = append(out, []string(*v)...)
		}
	}
	return out
}

func TestBuildFacetsWhereClause_pageScopeSurvivesBrandAndStoreOmit(t *testing.T) {
	base := GetFacetsParams{
		BrandScope:         []string{"Fox"},
		Brands:             []string{"RockShox"},
		StoreName:          "Bell",
		CategoryFilterIDs:  []int{9},
		ExcludeCategoryIDs: []int{3},
	}

	brandWhere, brandArgs := buildFacetsWhereClause(withoutUserBrands(base), nil, true)
	if strings.Count(brandWhere, "l.brand ILIKE ANY") != 1 {
		t.Fatalf("brand facets should keep only page scope, got %q", brandWhere)
	}
	if !strings.Contains(brandWhere, "s.name ILIKE") {
		t.Fatalf("brand facets should still scope to the selected store: %q", brandWhere)
	}
	if !strings.Contains(brandWhere, "NOT (l.category_id = ANY") {
		t.Fatalf("expected exclude-category predicate: %q", brandWhere)
	}
	gotBrand := stringArgs(brandArgs)
	if !containsString(gotBrand, "Fox") || !containsString(gotBrand, "Bell") || containsString(gotBrand, "RockShox") {
		t.Fatalf("brand facet args = %#v", brandArgs)
	}

	storeWhere, storeArgs := buildFacetsWhereClause(withoutStore(base), nil, true)
	if strings.Contains(storeWhere, "s.name ILIKE") {
		t.Fatalf("store facets should omit the store filter: %q", storeWhere)
	}
	if strings.Count(storeWhere, "l.brand ILIKE ANY") != 2 {
		t.Fatalf("store facets should AND page scope with the selected brand: %q", storeWhere)
	}
	gotStore := stringArgs(storeArgs)
	if !containsString(gotStore, "Fox") || !containsString(gotStore, "RockShox") || containsString(gotStore, "Bell") {
		t.Fatalf("store facet args = %#v", storeArgs)
	}
}

func containsString(vals []string, want string) bool {
	for _, v := range vals {
		if v == want {
			return true
		}
	}
	return false
}

func TestDealsFilterSQL_brandScopeAndSelection(t *testing.T) {
	frag, args, next, err := (*DB)(nil).dealsFilterSQL(context.Background(), GetDealsParams{
		BrandScope: []string{"Fox"},
		Brands:     []string{"Fox"},
	}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(frag, "l.brand ILIKE ANY") != 2 {
		t.Fatalf("expected scope AND selection, got %q", frag)
	}
	if next != 3 || len(args) != 2 {
		t.Fatalf("next=%d args=%#v", next, args)
	}
}

func TestFacetsListingGate(t *testing.T) {
	t.Run("empty suffix", func(t *testing.T) {
		got := facetsListingGate("")
		if !strings.Contains(got, "l.is_in_stock = true") {
			t.Fatalf("expected is_in_stock in %q", got)
		}
		if !strings.Contains(got, "l.hidden = false") {
			t.Fatalf("expected hidden = false in %q", got)
		}
	})
	t.Run("appends buildFacetsWhereClause suffix", func(t *testing.T) {
		suffix := " AND l.brand ILIKE $1"
		got := facetsListingGate(suffix)
		if !strings.HasPrefix(strings.TrimSpace(got), "AND l.is_in_stock") {
			t.Fatalf("expected gate first segment: %q", got)
		}
		if !strings.Contains(got, suffix) {
			t.Fatalf("expected suffix appended: %q", got)
		}
		idxStock := strings.Index(got, "is_in_stock")
		idxSuffix := strings.Index(got, suffix)
		if idxSuffix < idxStock {
			t.Fatalf("gate should precede suffix: %q", got)
		}
	})
}
