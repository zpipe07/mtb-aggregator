package db

// DB-backed tests for EnrichmentStateStore. These run only when TEST_DATABASE_URL
// is set (e.g. postgres://mtb:mtb@localhost:5432/mtb_deals) and migration 028 is
// applied; otherwise they skip so the default suite stays DB-free.

import (
	"context"
	"os"
	"testing"
	"time"
)

func testDB(t *testing.T) *DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB-backed test")
	}
	d, err := New(url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(d.Close)
	return d
}

// createEnrichmentTestListing inserts a store + listing and returns the listing id.
// Rows are removed on cleanup (listing_enrichment cascades from store_listings).
func createEnrichmentTestListing(t *testing.T, d *DB) int {
	t.Helper()
	ctx := context.Background()
	var storeID int
	err := d.pool.QueryRow(ctx, `
		INSERT INTO stores (name, base_url, scrape_url, store_type)
		VALUES ('__test_enrichstate__', 'http://test.invalid', 'http://test.invalid/sale', 'jensonusa')
		RETURNING id
	`).Scan(&storeID)
	if err != nil {
		t.Fatalf("insert store: %v", err)
	}
	var listingID int
	err = d.pool.QueryRow(ctx, `
		INSERT INTO store_listings (store_id, store_sku, product_name, current_price, product_url, is_in_stock)
		VALUES ($1, '__test-sku__', '__test product__', 100, 'http://test.invalid/p/1', true)
		RETURNING id
	`, storeID).Scan(&listingID)
	if err != nil {
		t.Fatalf("insert listing: %v", err)
	}
	t.Cleanup(func() {
		_, _ = d.pool.Exec(ctx, `DELETE FROM store_listings WHERE id = $1`, listingID)
		_, _ = d.pool.Exec(ctx, `DELETE FROM stores WHERE id = $1`, storeID)
	})
	return listingID
}

// Reproduces the 8pm job failure: migration 028 backfills listing_enrichment rows
// with pdp_fetched_at set but pdp_hash NULL. GetState must tolerate the NULL hash
// instead of failing with `cannot scan NULL into *string`.
func TestEnrichmentStateStore_GetState_nullPDPHashFromBackfill(t *testing.T) {
	d := testDB(t)
	ctx := context.Background()
	listingID := createEnrichmentTestListing(t, d)

	// Mimic the migration 028 backfill row: fetched_at set, hash NULL.
	_, err := d.pool.Exec(ctx, `
		INSERT INTO listing_enrichment (listing_id, pdp_fetched_at, pdp_hash)
		VALUES ($1, NOW() - INTERVAL '1 day', NULL)
	`, listingID)
	if err != nil {
		t.Fatalf("insert backfill-style row: %v", err)
	}

	store := EnrichmentStateStore{DB: d}
	st, err := store.GetState(ctx, listingID)
	if err != nil {
		t.Fatalf("GetState on backfilled row: %v", err)
	}
	if st == nil {
		t.Fatal("expected state, got nil")
	}
	if st.PDPHash != "" {
		t.Fatalf("expected empty hash for NULL column, got %q", st.PDPHash)
	}
	if st.PDP.CompletedAt == nil {
		t.Fatal("expected pdp_fetched_at to be set")
	}
}

// GetState round-trips a fully-populated row (all nullable columns non-NULL).
func TestEnrichmentStateStore_GetState_populatedRow(t *testing.T) {
	d := testDB(t)
	ctx := context.Background()
	listingID := createEnrichmentTestListing(t, d)

	now := time.Now().UTC().Truncate(time.Second)
	_, err := d.pool.Exec(ctx, `
		INSERT INTO listing_enrichment (
			listing_id, pdp_fetched_at, pdp_hash, pdp_attempts, pdp_error, next_pdp_attempt_at,
			classified_at, llm_confidence, prompt_profile_version, extracted_at
		) VALUES ($1, $2, 'abc123', 2, 'boom', $2, $2, 0.9, $2, $2)
	`, listingID, now)
	if err != nil {
		t.Fatalf("insert populated row: %v", err)
	}

	store := EnrichmentStateStore{DB: d}
	st, err := store.GetState(ctx, listingID)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if st.PDPHash != "abc123" {
		t.Fatalf("hash: got %q want abc123", st.PDPHash)
	}
	if st.PDP.Attempts != 2 || st.PDP.Error != "boom" {
		t.Fatalf("pdp step: got %+v", st.PDP)
	}
	if st.LLMConfidence == nil || *st.LLMConfidence < 0.89 || *st.LLMConfidence > 0.91 {
		t.Fatalf("confidence: got %v", st.LLMConfidence)
	}
}
