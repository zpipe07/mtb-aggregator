package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// GroupSibling is a listing row in the same product_group_key family.
type GroupSibling struct {
	ID       int
	StoreSKU string
}

// ListingsInGroup returns non-hidden sibling listings for a store and product_group_key.
func (db *DB) ListingsInGroup(ctx context.Context, storeID int, productGroupKey string) ([]GroupSibling, error) {
	if strings.TrimSpace(productGroupKey) == "" {
		return nil, nil
	}
	rows, err := db.pool.Query(ctx, `
		SELECT id, COALESCE(store_sku, '')
		FROM store_listings
		WHERE store_id = $1 AND product_group_key = $2 AND hidden = false
		ORDER BY id
	`, storeID, productGroupKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GroupSibling
	for rows.Next() {
		var s GroupSibling
		if err := rows.Scan(&s.ID, &s.StoreSKU); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// UpdateListingVariantInfo sets variant_options (optional), is_in_stock, and sets product_group_key when provided.
func (db *DB) UpdateListingVariantInfo(ctx context.Context, listingID int, variantOpts *json.RawMessage, isInStock bool, productGroupKey string) error {
	var opts interface{}
	if variantOpts != nil && len(*variantOpts) > 0 {
		opts = string(*variantOpts)
	}
	pgk := strings.TrimSpace(productGroupKey)
	var pgkArg interface{}
	if pgk != "" {
		pgkArg = pgk
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE store_listings SET
			variant_options = CASE WHEN $2::text IS NULL OR BTRIM($2::text) = '' THEN variant_options ELSE $2::jsonb END,
			is_in_stock = $3,
			product_group_key = COALESCE($4::text, product_group_key)
		WHERE id = $1
	`, listingID, opts, isInStock, pgkArg)
	return err
}

// JensonPDPVariant is one variant from JensonUSA PDP enrich (serverSideViewModel.variants).
type JensonPDPVariant struct {
	Code        string
	Dimensions  map[string]string
	IsOrderable bool
}

func sortedVariantOptionsJSON(dims map[string]string) (json.RawMessage, error) {
	if len(dims) == 0 {
		return nil, nil
	}
	keys := make([]string, 0, len(dims))
	for k := range dims {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	ordered := make(map[string]string, len(dims))
	for _, k := range keys {
		ordered[k] = dims[k]
	}
	return json.Marshal(ordered)
}

// ApplyJensonPDPVariantFanout updates variant_options and is_in_stock for all sibling listings sharing the parent's product_group_key.
// Parent code is the substring of storeSKU before the first space (e.g. JE002563 from "JE002563 CREAM S").
// When seen is non-nil, skips duplicate work for the same group within one job (first listing's PDP response already updated siblings).
func (db *DB) ApplyJensonPDPVariantFanout(ctx context.Context, storeID int, storeType, storeSKU string, variants []JensonPDPVariant, seen map[string]bool) error {
	if len(variants) == 0 || !strings.EqualFold(strings.TrimSpace(storeType), "jensonusa") {
		return nil
	}
	parentCode := strings.TrimSpace(strings.SplitN(strings.TrimSpace(storeSKU), " ", 2)[0])
	if parentCode == "" {
		return nil
	}
	groupKey := fmt.Sprintf("%d:%s", storeID, parentCode)
	if seen != nil {
		if seen[groupKey] {
			return nil
		}
		seen[groupKey] = true
	}

	siblings, err := db.ListingsInGroup(ctx, storeID, groupKey)
	if err != nil {
		return err
	}
	byCode := make(map[string]JensonPDPVariant, len(variants))
	for _, v := range variants {
		c := strings.TrimSpace(v.Code)
		if c != "" {
			byCode[c] = v
		}
	}

	for _, sib := range siblings {
		v, ok := byCode[strings.TrimSpace(sib.StoreSKU)]
		if ok {
			optsJSON, err := sortedVariantOptionsJSON(v.Dimensions)
			if err != nil {
				return fmt.Errorf("marshal variant_options for listing %d: %w", sib.ID, err)
			}
			var optsPtr *json.RawMessage
			if len(optsJSON) > 0 {
				optsPtr = &optsJSON
			}
			if err := db.UpdateListingVariantInfo(ctx, sib.ID, optsPtr, v.IsOrderable, groupKey); err != nil {
				return err
			}
			continue
		}
		if err := db.UpdateListingVariantInfo(ctx, sib.ID, nil, false, groupKey); err != nil {
			return err
		}
	}
	return nil
}

// JensonVariantBackfillRow is a representative listing per product_group_key for PDP variant backfill.
type JensonVariantBackfillRow struct {
	StoreID    int
	ProductURL string
	StoreSKU   string
}

// ListJensonVariantBackfillLeaders returns one row per distinct product_group_key for JensonUSA.
func (db *DB) ListJensonVariantBackfillLeaders(ctx context.Context) ([]JensonVariantBackfillRow, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT ON (l.product_group_key)
			l.store_id, l.product_url, COALESCE(l.store_sku, '')
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE s.store_type = 'jensonusa'
		  AND l.product_group_key IS NOT NULL
		  AND BTRIM(l.product_group_key::text) != ''
		  AND l.hidden = false
		ORDER BY l.product_group_key, l.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []JensonVariantBackfillRow
	for rows.Next() {
		var r JensonVariantBackfillRow
		if err := rows.Scan(&r.StoreID, &r.ProductURL, &r.StoreSKU); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
