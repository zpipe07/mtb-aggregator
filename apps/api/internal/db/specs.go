package db

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/metadata"
)

// GetFacetsParams mirrors GetDealsParams for filter context. SpecFilters supports multiple spec filters.
type GetFacetsParams struct {
	StoreID           *int
	StoreName         string
	Brand             string
	Category          string
	CanonicalCategory string
	MinDiscount       *float64
	Search            string
	SpecFilters       map[string]string // key -> value, e.g. {"hub_spacing": "148mm"}
}

// SpecFacetValue is one value option for a spec facet with its count.
type SpecFacetValue struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// SpecFacet is a spec key with its display label, product count, and value options.
type SpecFacet struct {
	Key          string           `json:"key"`
	Label        string           `json:"label"`
	ProductCount int             `json:"product_count"`
	Values       []SpecFacetValue `json:"values"`
}

// BrandFacet is a brand option with count.
type BrandFacet struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// PriceRange is min/max price in the filtered set.
type PriceRange struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}

// GetFacetsResult is the response for GET /facets.
type GetFacetsResult struct {
	SpecFacets   []SpecFacet  `json:"spec_facets"`
	BrandFacets  []BrandFacet `json:"brand_facets"`
	PriceRange   PriceRange  `json:"price_range"`
	TotalMatching int        `json:"total_matching"`
}

// GetFacets returns facets (spec keys/values, brands, price range) for the given filter context.
func (db *DB) GetFacets(ctx context.Context, params GetFacetsParams) (*GetFacetsResult, error) {
	where, args := buildFacetsWhereClause(params)
	if where == "" {
		where = " AND l.is_in_stock = true"
	} else {
		where = " AND l.is_in_stock = true" + where
	}

	baseFrom := `
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1` + where

	// Total matching count
	var totalMatching int
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) `+baseFrom, args...).Scan(&totalMatching)
	if err != nil {
		return nil, fmt.Errorf("facets total count: %w", err)
	}

	// Price range
	var priceMin, priceMax *float64
	err = db.pool.QueryRow(ctx, `SELECT MIN(l.current_price), MAX(l.current_price) `+baseFrom, args...).Scan(&priceMin, &priceMax)
	if err != nil {
		return nil, fmt.Errorf("facets price range: %w", err)
	}
	priceRange := PriceRange{}
	if priceMin != nil {
		priceRange.Min = *priceMin
	}
	if priceMax != nil {
		priceRange.Max = *priceMax
	}

	// Spec facets: get (key, value, count) then group by key
	specKeyValuesQuery := `
		WITH filtered AS (
			SELECT l.id, l.metadata
			` + baseFrom + `
			AND l.metadata->'specs' IS NOT NULL
			AND jsonb_typeof(l.metadata->'specs') = 'object'
		)
		SELECT spec.key, spec.value, COUNT(DISTINCT f.id) as cnt
		FROM filtered f
		CROSS JOIN LATERAL jsonb_each_text(f.metadata->'specs') AS spec(key, value)
		WHERE spec.value IS NOT NULL AND trim(spec.value) <> ''
		GROUP BY spec.key, spec.value
		ORDER BY spec.key, cnt DESC`
	rows, err := db.pool.Query(ctx, specKeyValuesQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("facets spec key/values: %w", err)
	}
	defer rows.Close()

	type kv struct {
		key   string
		value string
		count int
	}
	var kvs []kv
	for rows.Next() {
		var k, v string
		var c int
		if err := rows.Scan(&k, &v, &c); err != nil {
			return nil, err
		}
		kvs = append(kvs, kv{key: k, value: v, count: c})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Group by key: product_count = sum of count (each product has one value per key, so no double-count)
	keyProductCount := make(map[string]int)
	keyValues := make(map[string][]SpecFacetValue)
	for _, r := range kvs {
		keyProductCount[r.key] += r.count
		if len(keyValues[r.key]) < 50 {
			keyValues[r.key] = append(keyValues[r.key], SpecFacetValue{Value: r.value, Count: r.count})
		}
	}

	// Build spec facets: only keys with >= 3 products, limit 20 keys
	const minCoverage = 3
	const maxKeys = 20
	var specFacets []SpecFacet
	keyOrder := make([]string, 0, len(keyProductCount))
	for k := range keyProductCount {
		if keyProductCount[k] >= minCoverage {
			keyOrder = append(keyOrder, k)
		}
	}
	// Sort by product count descending
	sort.Slice(keyOrder, func(i, j int) bool {
		return keyProductCount[keyOrder[i]] > keyProductCount[keyOrder[j]]
	})
	for i, k := range keyOrder {
		if i >= maxKeys {
			break
		}
		specFacets = append(specFacets, SpecFacet{
			Key:          k,
			Label:        metadata.SpecKeyToLabel(k),
			ProductCount: keyProductCount[k],
			Values:       keyValues[k],
		})
	}

	// Brand facets
	brandQuery := `
		SELECT l.brand, COUNT(*) as cnt
		` + baseFrom + `
		AND l.brand IS NOT NULL AND trim(l.brand) <> ''
		GROUP BY l.brand
		ORDER BY cnt DESC
		LIMIT 50`
	rows2, err := db.pool.Query(ctx, brandQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("facets brands: %w", err)
	}
	defer rows2.Close()

	var brandFacets []BrandFacet
	for rows2.Next() {
		var b string
		var c int
		if err := rows2.Scan(&b, &c); err != nil {
			return nil, err
		}
		brandFacets = append(brandFacets, BrandFacet{Value: b, Count: c})
	}
	if err := rows2.Err(); err != nil {
		return nil, err
	}

	return &GetFacetsResult{
		SpecFacets:   specFacets,
		BrandFacets:  brandFacets,
		PriceRange:   priceRange,
		TotalMatching: totalMatching,
	}, nil
}

// buildFacetsWhereClause returns the WHERE fragment and args for the facets query.
func buildFacetsWhereClause(params GetFacetsParams) (string, []interface{}) {
	var sb strings.Builder
	args := []interface{}{}
	argNum := 1

	if params.StoreID != nil {
		sb.WriteString(fmt.Sprintf(" AND l.store_id = $%d", argNum))
		args = append(args, *params.StoreID)
		argNum++
	}
	if params.StoreName != "" {
		sb.WriteString(fmt.Sprintf(" AND s.name ILIKE $%d", argNum))
		args = append(args, params.StoreName)
		argNum++
	}
	if params.Brand != "" {
		sb.WriteString(fmt.Sprintf(" AND l.brand ILIKE $%d", argNum))
		args = append(args, params.Brand)
		argNum++
	}
	if params.Category != "" {
		sb.WriteString(fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(COALESCE(l.category_path, '{}')) AS c WHERE c ILIKE $%d)", argNum))
		args = append(args, params.Category)
		argNum++
	}
	if params.CanonicalCategory != "" {
		path := strings.Split(params.CanonicalCategory, " > ")
		trimmed := make([]string, 0, len(path))
		for _, p := range path {
			if t := strings.TrimSpace(p); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		if len(trimmed) > 0 {
			sb.WriteString(fmt.Sprintf(" AND l.canonical_category = $%d", argNum))
			args = append(args, pq.Array(trimmed))
			argNum++
		}
	}
	for k, v := range params.SpecFilters {
		if k == "" || v == "" {
			continue
		}
		sb.WriteString(fmt.Sprintf(" AND l.metadata->'specs'->>$%d ILIKE $%d", argNum, argNum+1))
		args = append(args, k, v)
		argNum += 2
	}
	if params.MinDiscount != nil && *params.MinDiscount > 0 {
		sb.WriteString(fmt.Sprintf(" AND l.original_price IS NOT NULL AND l.original_price > 0 AND l.current_price < l.original_price AND (1 - l.current_price / l.original_price) * 100 >= $%d", argNum))
		args = append(args, *params.MinDiscount)
		argNum++
	}
	if params.Search != "" {
		sb.WriteString(fmt.Sprintf(" AND l.search_vector @@ plainto_tsquery('english', $%d)", argNum))
		args = append(args, params.Search)
		argNum++
	}

	return sb.String(), args
}

// GetDistinctMetadataValues returns distinct non-empty values for a given metadata key.
// Used to populate spec-based filter dropdowns.
func (db *DB) GetDistinctMetadataValues(ctx context.Context, key string, limit int) ([]string, error) {
	if key == "" {
		return []string{}, nil
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT metadata->'specs'->>$1 AS v
		FROM store_listings
		WHERE metadata->'specs' IS NOT NULL AND metadata->'specs' ? $1 AND metadata->'specs'->>$1 IS NOT NULL AND metadata->'specs'->>$1 <> ''
		ORDER BY v
		LIMIT %d
	`, limit)

	rows, err := db.pool.Query(ctx, query, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

