package db

import (
	"strings"
	"testing"
)

func TestCategorySubtreeCountsMatchGroupedDealsContract(t *testing.T) {
	// Shopper-facing category product_count must use the same grouping key,
	// visibility gate, and stores join as GET /deals?group_variants=true (ZAC-268).
	q := categorySubtreeProductCountsQuery()
	wantKey := productGroupKeyExpr("l")
	if !strings.Contains(q, wantKey) {
		t.Fatalf("product counts query missing %q\n%s", wantKey, q)
	}
	if !strings.Contains(q, "JOIN stores") {
		t.Fatalf("product counts query must join stores like GET /deals\n%s", q)
	}
	if !strings.Contains(q, listingVisibilityGate) {
		t.Fatalf("product counts query missing listingVisibilityGate\n%s", q)
	}

	dealQ := categorySubtreeDealCountsQuery()
	if !strings.Contains(dealQ, "JOIN stores") {
		t.Fatalf("deal counts query must join stores like GET /deals\n%s", dealQ)
	}
	if !strings.Contains(dealQ, listingVisibilityGate) {
		t.Fatalf("deal counts query missing listingVisibilityGate\n%s", dealQ)
	}
}

func TestProductGroupKeyExprAliasesStoreVisibleKey(t *testing.T) {
	if productGroupKeyExpr("") != storeVisibleProductGroupKey {
		t.Fatalf("empty alias should equal storeVisibleProductGroupKey")
	}
	want := `COALESCE(f.product_group_key, 'single:' || f.id::text)`
	if got := productGroupKeyExpr("f"); got != want {
		t.Fatalf("productGroupKeyExpr(f) = %q, want %q", got, want)
	}
}
