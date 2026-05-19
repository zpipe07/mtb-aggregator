package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
)

// CCVariant is one row from Competitive Cyclist PDP JSON-LD hasVariant.
type CCVariant struct {
	Code        string
	Dimensions  map[string]string
	IsOrderable bool
}

// LogCCVariantFanoutInput logs scraper enrich output before fan-out (API-side).
func LogCCVariantFanoutInput(listingID int, storeSKU, productURL string, variantCount int) {
	log.Printf("[cc-variants] listing %d enrich returned variants=%d store_sku=%q product_url=%q",
		listingID, variantCount, storeSKU, productURL)
	if variantCount == 0 {
		log.Printf("[cc-variants] listing %d: no variants from scraper — product_group_key will not be set (check scraper competitivecyclist enrich debug logs for WAF/html_bytes/hasVariant parse)", listingID)
	}
}

// NormalizeProductURL strips query and fragment for CC variant grouping and URL matching.
func NormalizeProductURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	u, err := url.Parse(s)
	if err != nil {
		if i := strings.IndexAny(s, "?#"); i >= 0 {
			return strings.TrimSuffix(s[:i], "/")
		}
		return strings.TrimSuffix(s, "/")
	}
	u.RawQuery = ""
	u.Fragment = ""
	out := u.String()
	return strings.TrimSuffix(out, "/")
}

func productSlugFromURL(normalized string) string {
	u, err := url.Parse(normalized)
	if err != nil || u.Path == "" || u.Path == "/" {
		return ""
	}
	path := strings.Trim(u.Path, "/")
	if path == "" {
		return ""
	}
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[i+1:]
	}
	return path
}

// ApplyCompetitiveCyclistVariantFanout sets product_group_key and variant_options on existing
// catalog rows that share the same normalized product_url and matching store_sku.
// Unmatched rows are left unchanged (catalog may omit non-sale SKUs).
func (db *DB) ApplyCompetitiveCyclistVariantFanout(ctx context.Context, storeID int, productURL string, variants []CCVariant, seen map[string]bool) error {
	if len(variants) == 0 {
		log.Printf("[cc-variants] fan-out skip: variants=0 product_url=%q", productURL)
		return nil
	}
	normalized := NormalizeProductURL(productURL)
	slug := productSlugFromURL(normalized)
	if normalized == "" || slug == "" {
		log.Printf("[cc-variants] fan-out skip: bad url normalized=%q slug=%q raw=%q", normalized, slug, productURL)
		return nil
	}
	groupKey := fmt.Sprintf("%d:%s", storeID, slug)
	if seen != nil {
		if seen[groupKey] {
			log.Printf("[cc-variants] fan-out skip: already processed group=%s product_url=%s", groupKey, normalized)
			return nil
		}
		seen[groupKey] = true
	}

	bySKU := make(map[string]CCVariant, len(variants))
	skuSample := make([]string, 0, 3)
	for _, v := range variants {
		code := strings.TrimSpace(v.Code)
		if code != "" {
			bySKU[code] = v
			if len(skuSample) < 3 {
				skuSample = append(skuSample, code)
			}
		}
	}
	log.Printf("[cc-variants] fan-out start: store_id=%d group=%s product_url=%s pdp_variants=%d sample_pdp_skus=%v",
		storeID, groupKey, normalized, len(bySKU), skuSample)

	rows, err := db.pool.Query(ctx, `
		SELECT id, COALESCE(store_sku, ''), product_url
		FROM store_listings
		WHERE store_id = $1 AND hidden = false
		  AND split_part(product_url, '?', 1) = $2
	`, storeID, normalized)
	if err != nil {
		return err
	}
	defer rows.Close()

	var matched, skipped, rowsSeen int
	var unmatchedSKUs []string
	for rows.Next() {
		rowsSeen++
		var id int
		var sku, rowURL string
		if err := rows.Scan(&id, &sku, &rowURL); err != nil {
			return err
		}
		if NormalizeProductURL(rowURL) != normalized {
			log.Printf("[cc-variants] fan-out row skip url_mismatch listing_id=%d store_sku=%q row_url=%q", id, sku, rowURL)
			continue
		}
		v, ok := bySKU[strings.TrimSpace(sku)]
		if !ok {
			skipped++
			if len(unmatchedSKUs) < 5 {
				unmatchedSKUs = append(unmatchedSKUs, sku)
			}
			continue
		}
		optsJSON, err := sortedVariantOptionsJSON(v.Dimensions)
		if err != nil {
			return fmt.Errorf("marshal variant_options for listing %d: %w", id, err)
		}
		var optsPtr *json.RawMessage
		if len(optsJSON) > 0 {
			optsPtr = &optsJSON
		}
		if err := db.UpdateListingVariantInfo(ctx, id, optsPtr, v.IsOrderable, groupKey); err != nil {
			return err
		}
		matched++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	log.Printf("[cc-variants] fan-out done: product_url=%s group=%s db_rows=%d matched=%d skipped_sku=%d unmatched_sample=%v",
		normalized, groupKey, rowsSeen, matched, skipped, unmatchedSKUs)
	if rowsSeen == 0 {
		log.Printf("[cc-variants] fan-out warning: no store_listings rows for store_id=%d normalized product_url=%q", storeID, normalized)
	}
	if matched == 0 && len(bySKU) > 0 {
		log.Printf("[cc-variants] fan-out warning: PDP had %d variant SKUs but none matched store_sku on listings (Impact CatalogItemId vs JSON-LD sku mismatch?)", len(bySKU))
	}
	return nil
}

// CCVariantBackfillRow is one distinct PDP URL to enrich for CC variant fan-out.
type CCVariantBackfillRow struct {
	StoreID    int
	ProductURL string
	StoreSKU   string
}

// ListCCVariantBackfillLeaders returns one listing per distinct normalized product_url for competitivecyclist.
func (db *DB) ListCCVariantBackfillLeaders(ctx context.Context) ([]CCVariantBackfillRow, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT ON (split_part(l.product_url, '?', 1))
			l.store_id, l.product_url, COALESCE(l.store_sku, '')
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE s.store_type = 'competitivecyclist'
		  AND l.hidden = false
		  AND l.product_url IS NOT NULL
		  AND BTRIM(l.product_url) != ''
		  AND (l.product_group_key IS NULL OR BTRIM(l.product_group_key) = '')
		ORDER BY split_part(l.product_url, '?', 1), l.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CCVariantBackfillRow
	for rows.Next() {
		var r CCVariantBackfillRow
		if err := rows.Scan(&r.StoreID, &r.ProductURL, &r.StoreSKU); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
