package db

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestUpsertListingsBatch_onConflictMatchesSingleRow(t *testing.T) {
	conflict := strings.TrimSpace(upsertListingOnConflictSQL)
	for _, frag := range []string{
		"affiliate_url = CASE",
		"canonical_category = CASE",
		"category_id = COALESCE",
		"metadata = CASE",
		"product_group_key = COALESCE",
		"variant_options = COALESCE",
		"hidden = false",
		"llm_specs",
		"clothing_size",
		"bike_size",
	} {
		if !strings.Contains(conflict, frag) {
			t.Errorf("ON CONFLICT SQL missing fragment %q", frag)
		}
	}
	if ListingsUpsertBatchSize() != 500 {
		t.Errorf("ListingsUpsertBatchSize() = %d, want 500", ListingsUpsertBatchSize())
	}
}

func TestUpsertListingsBatch_nestedArraysUseJSONB(t *testing.T) {
	src, err := os.ReadFile("listings_upsert.go")
	if err != nil {
		t.Fatalf("read listings_upsert.go: %v", err)
	}
	s := string(src)
	if strings.Contains(s, "$10::text[][]") || strings.Contains(s, "$11::text[][]") {
		t.Fatal("batch upsert must not UNNEST text[][] for category_path/canonical_category (SQLSTATE 42804)")
	}
	if !strings.Contains(s, "$10::jsonb[]") || !strings.Contains(s, "$11::jsonb[]") {
		t.Fatal("batch upsert must bind category_path/canonical_category as jsonb[]")
	}
	if !strings.Contains(s, "jsonb_array_elements_text(u.category_path)") {
		t.Fatal("batch upsert must convert category_path jsonb to text[]")
	}
}

func TestUpsertListingsBatch_mergeAndPriceHistory(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB-backed test")
	}
	d, err := New(url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(d.Close)
	ctx := context.Background()

	var storeID int
	err = d.pool.QueryRow(ctx, `
		INSERT INTO stores (name, base_url, scrape_url, store_type)
		VALUES ('__test_batch_upsert__', 'http://test.invalid', 'http://test.invalid/sale', 'jensonusa')
		RETURNING id
	`).Scan(&storeID)
	if err != nil {
		t.Fatalf("insert store: %v", err)
	}
	t.Cleanup(func() {
		_, _ = d.pool.Exec(ctx, `DELETE FROM store_listings WHERE store_id = $1`, storeID)
		_, _ = d.pool.Exec(ctx, `DELETE FROM stores WHERE id = $1`, storeID)
	})

	existingMeta, _ := json.Marshal(map[string]interface{}{
		"specs": map[string]string{"wheel_size": "29"},
	})
	var existingID int
	err = d.pool.QueryRow(ctx, `
		INSERT INTO store_listings (store_id, store_sku, product_name, current_price, product_url, metadata, is_in_stock, hidden)
		VALUES ($1, 'existing-sku', 'Existing Product', 99, 'http://test.invalid/p/existing', $2::jsonb, true, true)
		RETURNING id
	`, storeID, existingMeta).Scan(&existingID)
	if err != nil {
		t.Fatalf("insert existing listing: %v", err)
	}

	orig := 120.0
	listings := []Listing{
		{
			StoreID:      storeID,
			StoreSKU:     "new-sku",
			ProductName:  "New Product",
			CurrentPrice: 50,
			ProductURL:   "http://test.invalid/p/new",
			IsInStock:    true,
			Metadata:     []byte("{}"),
			CategoryPath: []string{"Helmets"},
		},
		{
			StoreID:       storeID,
			StoreSKU:      "existing-sku",
			ProductName:   "Updated Name",
			CurrentPrice:  79,
			OriginalPrice: &orig,
			ProductURL:    "http://test.invalid/p/existing",
			IsInStock:     true,
			Metadata:      []byte("{}"), // empty scrape metadata must not wipe LLM specs
		},
	}

	upserted, err := d.UpsertListingsBatch(ctx, listings)
	if err != nil {
		t.Fatalf("UpsertListingsBatch: %v", err)
	}
	if len(upserted) != 2 {
		t.Fatalf("upserted count = %d, want 2", len(upserted))
	}

	ids := make([]int, len(upserted))
	prices := make([]float64, len(upserted))
	for i, u := range upserted {
		ids[i] = u.ID
		switch u.StoreSKU {
		case "new-sku":
			prices[i] = 50
		case "existing-sku":
			prices[i] = 79
			if u.ID != existingID {
				t.Errorf("existing listing id = %d, want %d", u.ID, existingID)
			}
		default:
			t.Fatalf("unexpected store_sku %q", u.StoreSKU)
		}
	}
	if err := d.InsertPriceHistoryBatch(ctx, ids, prices); err != nil {
		t.Fatalf("InsertPriceHistoryBatch: %v", err)
	}

	var meta []byte
	var name string
	var price float64
	var hidden bool
	err = d.pool.QueryRow(ctx, `
		SELECT product_name, current_price, metadata, hidden FROM store_listings
		WHERE store_id = $1 AND store_sku = 'existing-sku'
	`, storeID).Scan(&name, &price, &meta, &hidden)
	if err != nil {
		t.Fatalf("select existing: %v", err)
	}
	if hidden {
		t.Error("hidden = true after scrape upsert, want false (ZAC-217)")
	}
	if name != "Updated Name" {
		t.Errorf("product_name = %q, want Updated Name", name)
	}
	if price != 79 {
		t.Errorf("current_price = %v, want 79", price)
	}
	var metaMap map[string]interface{}
	if err := json.Unmarshal(meta, &metaMap); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	specs, ok := metaMap["specs"].(map[string]interface{})
	if !ok || specs["wheel_size"] != "29" {
		t.Errorf("metadata.specs not preserved: %v", metaMap)
	}

	var histCount int
	err = d.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM price_history WHERE listing_id = ANY($1)
	`, ids).Scan(&histCount)
	if err != nil {
		t.Fatalf("count price_history: %v", err)
	}
	if histCount != 2 {
		t.Errorf("price_history rows = %d, want 2", histCount)
	}

	var catPath pgtype.FlatArray[string]
	err = d.pool.QueryRow(ctx, `
		SELECT category_path FROM store_listings
		WHERE store_id = $1 AND store_sku = 'new-sku'
	`, storeID).Scan(&catPath)
	if err != nil {
		t.Fatalf("select new-sku category_path: %v", err)
	}
	if len(catPath) != 1 || catPath[0] != "Helmets" {
		t.Errorf("new-sku category_path = %#v, want [Helmets]", catPath)
	}
}
