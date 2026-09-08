package db

import (
	"strings"
	"testing"
)

// TestTouchVariantSiblingsLastScrapedSQL reproduces ZAC-196 contract:
// After a UC scrape upserts parent rows, variant siblings (store_sku LIKE '%-%')
// must have last_scraped refreshed before HideStaleListings runs, or they are
// incorrectly hidden despite still being on sale.
func TestTouchVariantSiblingsLastScrapedSQL(t *testing.T) {
	t.Parallel()
	sql := touchVariantSiblingsLastScrapedSQLString()
	for _, want := range []string{
		"UPDATE store_listings child",
		"SET last_scraped = NOW()",
		"FROM store_listings parent",
		"child.store_sku LIKE '%-%'",
		"parent.store_sku NOT LIKE '%-%'",
		"child.store_sku LIKE parent.store_sku || '-%'",
		"parent.last_scraped >= $2",
		"child.last_scraped < $2",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("touchVariantSiblingsLastScrapedSQL missing %q in:\n%s", want, sql)
		}
	}
}

// TestHideStaleListingsSQL documents the stale-hide predicate that variant
// siblings must be protected from via TouchVariantSiblingsLastScraped.
func TestHideStaleListingsSQL(t *testing.T) {
	t.Parallel()
	sql := hideStaleListingsSQLString()
	if !strings.Contains(sql, "last_scraped < $2") {
		t.Fatalf("hideStaleListingsSQL missing stale predicate: %q", sql)
	}
	if !strings.Contains(sql, "hidden = false") {
		t.Fatalf("hideStaleListingsSQL should only hide currently visible rows: %q", sql)
	}
}

func TestMaxRecentCompletedScrapeUpsertedSQL(t *testing.T) {
	t.Parallel()
	sql := maxRecentCompletedScrapeUpsertedSQLString()
	for _, want := range []string{
		"MAX(listings_upserted)",
		"status = 'completed'",
		"INTERVAL '14 days'",
		"store_id = $1",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("maxRecentCompletedScrapeUpsertedSQL missing %q in:\n%s", want, sql)
		}
	}
}
