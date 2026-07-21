package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"
)

func (db *DB) getDealsGrouped(ctx context.Context, params GetDealsParams) (*GetDealsResult, error) {
	if params.Limit <= 0 {
		params.Limit = 50
	}
	sort := params.Sort
	if sort == "" {
		sort = "discount"
	}
	if params.Search == "" && sort == "relevance" {
		sort = "discount"
	}

	priceDropFilter := wantsPriceDropFilter(params)
	argNum := 1
	fragArgs := []interface{}{}
	if priceDropFilter {
		fragArgs = append(fragArgs, priceDropWithinDays(params))
		argNum = 2
	}

	frag, filterArgs, nextArg, err := db.dealsFilterSQL(ctx, params, argNum)
	if err != nil {
		return nil, err
	}
	fragArgs = append(fragArgs, filterArgs...)

	priceDropJoin := ""
	if priceDropFilter {
		priceDropJoin = `
  JOIN recent_price_drops rpd ON rpd.listing_id = l.id
`
	}

	ctePrefix := ""
	if priceDropFilter {
		ctePrefix = `WITH ` + recentPriceDropsCTE(1) + `,`
	}

	filteredCTE := ctePrefix + `
filtered AS (
  SELECT l.id, l.store_id, s.name AS store_name, l.store_sku, l.product_name, l.current_price, l.original_price,
    l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}') AS category_path,
    COALESCE(l.canonical_category, '{}') AS canonical_category, l.metadata, l.is_in_stock, l.last_scraped,
    l.product_group_key, l.variant_options, l.search_vector` +
		func() string {
			if priceDropFilter {
				return `, rpd.drop_amount, rpd.dropped_at`
			}
			return ""
		}() + `
  FROM store_listings l
  JOIN stores s ON s.id = l.store_id` + priceDropJoin + `
  WHERE 1=1 AND l.is_in_stock = true AND l.hidden = false
` + frag + `
),
fk AS (
  SELECT f.*, COALESCE(f.product_group_key, 'single:' || f.id::text) AS gk FROM filtered f
)
`

	countQuery := filteredCTE + `SELECT COUNT(*)::int FROM (SELECT DISTINCT fk.gk FROM fk) t`
	var totalCount int
	if err := db.pool.QueryRow(ctx, countQuery, fragArgs...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("grouped deals count: %w", err)
	}

	args := append([]interface{}{}, fragArgs...)
	orderSQL := groupedRepsOrderSQL(sort, params.Search, nextArg, &args, priceDropFilter)

	limitArg := len(args) + 1
	offsetArg := len(args) + 2
	args = append(args, params.Limit, params.Offset)

	mainQuery := filteredCTE + `,
ranked AS (
  SELECT fk.*,
    ROW_NUMBER() OVER (PARTITION BY fk.gk ORDER BY fk.current_price ASC NULLS LAST, fk.id ASC) AS rn
  FROM fk
),
reps AS (
  SELECT * FROM ranked WHERE rn = 1
)
SELECT r.id, r.store_id, r.store_name, r.store_sku, r.product_name, r.current_price, r.original_price,
  r.product_url, r.affiliate_url, r.image_url, r.brand, r.category_path, r.canonical_category, r.metadata, r.is_in_stock, r.last_scraped::text,
  r.product_group_key, r.variant_options,
  agg.variants_json, agg.min_p, agg.max_p, agg.variant_cnt
FROM (
  SELECT * FROM reps r
  ORDER BY ` + orderSQL + `
  LIMIT $` + strconv.Itoa(limitArg) + ` OFFSET $` + strconv.Itoa(offsetArg) + `
) r
LEFT JOIN LATERAL (
  SELECT
    COALESCE(json_agg(json_build_object(
      'id', s.id,
      'store_sku', s.store_sku,
      'variant_options', s.variant_options,
      'current_price', s.current_price,
      'original_price', s.original_price,
      'is_in_stock', s.is_in_stock
    ) ORDER BY s.current_price ASC), '[]'::json) AS variants_json,
    MIN(s.current_price) AS min_p,
    MAX(s.current_price) AS max_p,
    COUNT(*)::int AS variant_cnt
  FROM store_listings s
  WHERE s.store_id = r.store_id AND s.hidden = false
    AND (
      (r.product_group_key IS NOT NULL AND s.product_group_key = r.product_group_key)
      OR (r.product_group_key IS NULL AND s.id = r.id)
    )
) agg ON true
`

	rows, err := db.pool.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("grouped deals query: %w", err)
	}
	defer rows.Close()

	var deals []Deal
	for rows.Next() {
		var d Deal
		var lastScraped []byte
		var cp, canCat pgtype.FlatArray[string]
		var meta []byte
		var pgk, vopt []byte
		var variants []byte
		var minP, maxP sql.NullFloat64
		var vcnt int
		if err := rows.Scan(&d.ID, &d.StoreID, &d.StoreName, &d.StoreSKU, &d.ProductName, &d.CurrentPrice, &d.OriginalPrice,
			&d.ProductURL, &d.AffiliateURL, &d.ImageURL, &d.Brand, &cp, &canCat, &meta, &d.IsInStock, &lastScraped,
			&pgk, &vopt, &variants, &minP, &maxP, &vcnt); err != nil {
			return nil, err
		}
		d.CategoryPath = cp
		d.CanonicalCategory = canCat
		d.Metadata = json.RawMessage(meta)
		d.LastScraped = string(lastScraped)
		if len(pgk) > 0 {
			s := string(pgk)
			d.ProductGroupKey = &s
		}
		if len(vopt) > 0 {
			d.VariantOptions = json.RawMessage(vopt)
		}
		if len(variants) > 0 {
			d.Variants = json.RawMessage(variants)
		}
		if vcnt > 0 {
			d.VariantCount = &vcnt
		}
		if minP.Valid && maxP.Valid && vcnt > 1 && (minP.Float64 != maxP.Float64) {
			d.PriceRange = []float64{minP.Float64, maxP.Float64}
		}
		if d.OriginalPrice != nil && *d.OriginalPrice > 0 && *d.OriginalPrice > d.CurrentPrice {
			pct := (1 - d.CurrentPrice/(*d.OriginalPrice)) * 100
			if pct > 0 {
				d.DiscountPct = &pct
			}
		}
		deals = append(deals, d)
	}
	if deals == nil {
		deals = []Deal{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := db.attachPriceHistorySummaries(ctx, deals); err != nil {
		return nil, err
	}
	return &GetDealsResult{Deals: deals, TotalCount: totalCount}, nil
}

// groupedRepsOrderSQL builds ORDER BY for the representative row subquery. nextArg is the next
// free placeholder index (1-based). Appends to args when relevance sort adds a search parameter.
func groupedRepsOrderSQL(sort, search string, nextArg int, args *[]interface{}, priceDropFilter bool) string {
	switch sort {
	case "relevance":
		if search == "" {
			if priceDropFilter {
				return "r.drop_amount DESC NULLS LAST, r.dropped_at DESC"
			}
			return "r.last_scraped DESC"
		}
		*args = append(*args, search)
		return fmt.Sprintf("ts_rank(r.search_vector, plainto_tsquery('english', $%d)) DESC", nextArg)
	case "discount":
		return `(CASE WHEN r.original_price IS NOT NULL AND r.original_price > 0 AND r.current_price < r.original_price THEN (1 - r.current_price / r.original_price) * 100 ELSE 0 END) DESC NULLS LAST`
	case "value":
		return `(CASE WHEN r.original_price IS NOT NULL AND r.original_price > 0 AND r.current_price < r.original_price THEN r.original_price - r.current_price ELSE 0 END) DESC NULLS LAST`
	case "price_asc":
		return "r.current_price ASC"
	case "price_desc":
		return "r.current_price DESC"
	case "price_drop":
		return "r.drop_amount DESC NULLS LAST, r.dropped_at DESC"
	default:
		if priceDropFilter {
			return "r.drop_amount DESC NULLS LAST, r.dropped_at DESC"
		}
		return "r.last_scraped DESC"
	}
}
