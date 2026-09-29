package db

import "testing"

func TestStoreVisibleProductGroupKey(t *testing.T) {
	// Contract: public store deal_count must match GET /deals?group_variants=true totals.
	const want = `COALESCE(product_group_key, 'single:' || id::text)`
	if storeVisibleProductGroupKey != want {
		t.Fatalf("storeVisibleProductGroupKey = %q, want %q", storeVisibleProductGroupKey, want)
	}
	if listingVisibilityGate != " AND l.is_in_stock = true AND l.hidden = false" {
		t.Fatalf("listingVisibilityGate changed: %q", listingVisibilityGate)
	}
	if productGroupKeyExpr("l") != `COALESCE(l.product_group_key, 'single:' || l.id::text)` {
		t.Fatalf("productGroupKeyExpr(l) drifted from storeVisibleProductGroupKey")
	}
}
