package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

const listingsUpsertBatchSize = 500

// ListingsUpsertBatchSize is the chunk size for batch upserts (UNNEST inserts).
func ListingsUpsertBatchSize() int {
	return listingsUpsertBatchSize
}

// upsertListingOnConflictSQL is the shared ON CONFLICT clause for single-row and batch upserts.
const upsertListingOnConflictSQL = `
		ON CONFLICT (store_id, store_sku) DO UPDATE SET
			product_name = EXCLUDED.product_name,
			current_price = EXCLUDED.current_price,
			original_price = EXCLUDED.original_price,
			product_url = EXCLUDED.product_url,
			affiliate_url = CASE WHEN NULLIF(TRIM(EXCLUDED.affiliate_url), '') IS NOT NULL THEN EXCLUDED.affiliate_url ELSE store_listings.affiliate_url END,
			image_url = EXCLUDED.image_url,
			brand = EXCLUDED.brand,
			category_path = CASE WHEN EXCLUDED.category_path IS NOT NULL AND array_length(EXCLUDED.category_path, 1) > 0 THEN EXCLUDED.category_path ELSE store_listings.category_path END,
			canonical_category = CASE WHEN store_listings.canonical_category IS NOT NULL AND array_length(store_listings.canonical_category, 1) > 0 THEN store_listings.canonical_category ELSE EXCLUDED.canonical_category END,
			category_id = COALESCE(store_listings.category_id, EXCLUDED.category_id),
			metadata = CASE
				WHEN EXCLUDED.metadata IS NULL OR EXCLUDED.metadata = '{}'::jsonb
				THEN store_listings.metadata
				WHEN store_listings.metadata IS NULL OR store_listings.metadata = '{}'::jsonb
				THEN EXCLUDED.metadata
				ELSE (
					COALESCE(store_listings.metadata, '{}'::jsonb)
					|| CASE
						WHEN EXCLUDED.metadata ? 'description'
							AND NULLIF(BTRIM(EXCLUDED.metadata->>'description'), '') IS NOT NULL
						THEN jsonb_build_object('description', EXCLUDED.metadata->'description')
						ELSE '{}'::jsonb
					END
					|| CASE
						WHEN EXCLUDED.metadata ? 'specs'
							AND jsonb_typeof(EXCLUDED.metadata->'specs') = 'object'
							AND EXCLUDED.metadata->'specs' <> '{}'::jsonb
						THEN jsonb_build_object(
							'specs',
							COALESCE(store_listings.metadata->'specs', '{}'::jsonb) || EXCLUDED.metadata->'specs'
						)
						ELSE '{}'::jsonb
					END
				)
			END,
			is_in_stock = EXCLUDED.is_in_stock,
			product_group_key = COALESCE(EXCLUDED.product_group_key, store_listings.product_group_key),
			variant_options = COALESCE(EXCLUDED.variant_options, store_listings.variant_options),
			last_scraped = NOW()`

// UpsertedListing is one row returned from UpsertListingsBatch.
type UpsertedListing struct {
	ID       int
	StoreSKU string
}

// GetLastPricesForStore returns current_price keyed by store_sku for shadow price-drop checks.
func (db *DB) GetLastPricesForStore(ctx context.Context, storeID int) (map[string]float64, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT store_sku, current_price FROM store_listings WHERE store_id = $1
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]float64)
	for rows.Next() {
		var sku string
		var price float64
		if err := rows.Scan(&sku, &price); err != nil {
			return nil, err
		}
		out[sku] = price
	}
	return out, rows.Err()
}

// UpsertListingsBatch upserts listings in chunks using UNNEST batch inserts with the same merge
// semantics as UpsertListing.
func (db *DB) UpsertListingsBatch(ctx context.Context, listings []Listing) ([]UpsertedListing, error) {
	if len(listings) == 0 {
		return nil, nil
	}
	var all []UpsertedListing
	for start := 0; start < len(listings); start += listingsUpsertBatchSize {
		end := start + listingsUpsertBatchSize
		if end > len(listings) {
			end = len(listings)
		}
		chunk, err := db.upsertListingsChunk(ctx, listings[start:end])
		if err != nil {
			return all, err
		}
		all = append(all, chunk...)
	}
	return all, nil
}

func (db *DB) upsertListingsChunk(ctx context.Context, listings []Listing) ([]UpsertedListing, error) {
	n := len(listings)
	storeIDs := make([]int32, n)
	storeSKUs := make([]string, n)
	productNames := make([]string, n)
	currentPrices := make([]float64, n)
	originalPrices := make([]pgtype.Float8, n)
	productURLs := make([]string, n)
	affiliateURLs := make([]pgtype.Text, n)
	imageURLs := make([]pgtype.Text, n)
	brands := make([]pgtype.Text, n)
	categoryPaths := make([][]string, n)
	canonicalCategories := make([][]string, n)
	categoryIDs := make([]pgtype.Int4, n)
	metadata := make([][]byte, n)
	isInStock := make([]bool, n)
	productGroupKeys := make([]pgtype.Text, n)
	variantOptions := make([][]byte, n)

	for i, l := range listings {
		storeIDs[i] = int32(l.StoreID)
		storeSKUs[i] = l.StoreSKU
		productNames[i] = l.ProductName
		currentPrices[i] = l.CurrentPrice
		if l.OriginalPrice != nil {
			originalPrices[i] = pgtype.Float8{Float64: *l.OriginalPrice, Valid: true}
		}
		productURLs[i] = l.ProductURL
		if l.AffiliateURL != nil {
			affiliateURLs[i] = pgtype.Text{String: *l.AffiliateURL, Valid: true}
		}
		if l.ImageURL != nil {
			imageURLs[i] = pgtype.Text{String: *l.ImageURL, Valid: true}
		}
		if l.Brand != nil {
			brands[i] = pgtype.Text{String: *l.Brand, Valid: true}
		}
		if len(l.CategoryPath) > 0 {
			categoryPaths[i] = l.CategoryPath
		}
		if len(l.CanonicalCategory) > 0 {
			canonicalCategories[i] = l.CanonicalCategory
		}
		if l.CategoryID != nil {
			categoryIDs[i] = pgtype.Int4{Int32: int32(*l.CategoryID), Valid: true}
		} else if len(l.CanonicalCategory) > 0 {
			if id, err := db.ResolveCategoryIDFromPath(ctx, l.CanonicalCategory); err == nil && id != nil {
				categoryIDs[i] = pgtype.Int4{Int32: int32(*id), Valid: true}
			}
		}
		if len(l.Metadata) > 0 {
			metadata[i] = l.Metadata
		} else {
			metadata[i] = []byte("{}")
		}
		isInStock[i] = l.IsInStock
		if l.ProductGroupHandle != nil {
			h := strings.TrimSpace(*l.ProductGroupHandle)
			if h != "" {
				productGroupKeys[i] = pgtype.Text{String: fmt.Sprintf("%d:%s", l.StoreID, h), Valid: true}
			}
		}
		if len(l.VariantOptions) > 0 {
			variantOptions[i] = l.VariantOptions
		}
	}

	sql := `
		INSERT INTO store_listings (
			store_id, store_sku, product_name, current_price, original_price, product_url,
			affiliate_url, image_url, brand, category_path, canonical_category, category_id,
			metadata, is_in_stock, product_group_key, variant_options, last_scraped
		)
		SELECT
			u.store_id,
			u.store_sku,
			u.product_name,
			u.current_price,
			u.original_price,
			u.product_url,
			u.affiliate_url,
			u.image_url,
			u.brand,
			u.category_path,
			u.canonical_category,
			u.category_id,
			u.metadata,
			u.is_in_stock,
			u.product_group_key,
			u.variant_options,
			NOW()
		FROM UNNEST(
			$1::int[],
			$2::text[],
			$3::text[],
			$4::float8[],
			$5::float8[],
			$6::text[],
			$7::text[],
			$8::text[],
			$9::text[],
			$10::text[][],
			$11::text[][],
			$12::int[],
			$13::jsonb[],
			$14::bool[],
			$15::text[],
			$16::jsonb[]
		) AS u(
			store_id, store_sku, product_name, current_price, original_price, product_url,
			affiliate_url, image_url, brand, category_path, canonical_category, category_id,
			metadata, is_in_stock, product_group_key, variant_options
		)` + upsertListingOnConflictSQL + `
		RETURNING id, store_sku`

	rows, err := db.pool.Query(ctx, sql,
		storeIDs,
		storeSKUs,
		productNames,
		currentPrices,
		originalPrices,
		productURLs,
		affiliateURLs,
		imageURLs,
		brands,
		categoryPaths,
		canonicalCategories,
		categoryIDs,
		metadata,
		isInStock,
		productGroupKeys,
		variantOptions,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []UpsertedListing
	for rows.Next() {
		var u UpsertedListing
		if err := rows.Scan(&u.ID, &u.StoreSKU); err != nil {
			return out, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// InsertPriceHistoryBatch inserts price_history rows for many listings in one statement.
func (db *DB) InsertPriceHistoryBatch(ctx context.Context, listingIDs []int, prices []float64) error {
	if len(listingIDs) == 0 {
		return nil
	}
	if len(listingIDs) != len(prices) {
		return fmt.Errorf("listingIDs and prices length mismatch: %d vs %d", len(listingIDs), len(prices))
	}
	ids := make([]int32, len(listingIDs))
	for i, id := range listingIDs {
		ids[i] = int32(id)
	}
	_, err := db.pool.Exec(ctx, `
		INSERT INTO price_history (listing_id, price)
		SELECT u.listing_id, u.price
		FROM UNNEST($1::int[], $2::float8[]) AS u(listing_id, price)
	`, ids, prices)
	return err
}
