package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/metadata"
)

// GetFacetsParams mirrors GetDealsParams for filter context. SpecFilters supports multiple spec filters.
type GetFacetsParams struct {
	StoreID           *int
	StoreName         string
	Brand             string
	Category          string
	CanonicalCategory string // legacy: "Bikes > Mountain"
	CategorySlug      string // preferred: slug for subtree filter
	MinDiscount       *float64
	Search            string
	SpecFilters       map[string]string // key -> value, e.g. {"wheel_size": "29"}
	VariantFilters    map[string]string // variant option key -> value (e.g. Size -> Large)
	// CategoryFilterIDs is populated by GetFacets from CategorySlug or CanonicalCategory for WHERE clause.
	CategoryFilterIDs []int
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
	ProductCount int              `json:"product_count"`
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

// VariantFacetValue is one option for a variant dimension (e.g. size).
type VariantFacetValue struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// VariantFacet groups values under a variant option name (e.g. "Size").
type VariantFacet struct {
	Key    string              `json:"key"`
	Values []VariantFacetValue `json:"values"`
}

// GetFacetsResult is the response for GET /facets.
type GetFacetsResult struct {
	SpecFacets      []SpecFacet    `json:"spec_facets"`
	BrandFacets     []BrandFacet   `json:"brand_facets"`
	VariantFacets   []VariantFacet `json:"variant_facets"`
	PriceRange      PriceRange     `json:"price_range"`
	TotalMatching   int            `json:"total_matching"`
}

// filterableField holds display config for a profile field that appears as a filter.
type filterableField struct {
	key       string
	label     string
	sortOrder int
}

func parseFilterableFields(extractionSchema json.RawMessage) []filterableField {
	var schema llm.ExtractionSchema
	if err := json.Unmarshal(extractionSchema, &schema); err != nil || len(schema.Fields) == 0 {
		return nil
	}
	var out []filterableField
	for _, f := range schema.Fields {
		if f.Filterable != nil && !*f.Filterable {
			continue
		}
		label := f.Label
		if label == "" {
			label = metadata.SpecKeyToLabel(f.Key)
		}
		out = append(out, filterableField{key: f.Key, label: label, sortOrder: f.SortOrder})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].sortOrder != out[j].sortOrder {
			return out[i].sortOrder < out[j].sortOrder
		}
		return out[i].key < out[j].key
	})
	return out
}

// GetFacets returns facets (spec keys/values, brands, price range) for the given filter context.
// Spec facets are LLM-driven: when a canonical category is selected, the matching LLM prompt
// profile defines which specs appear as filters. When no category or no profile matches,
// spec facets are empty.
func (db *DB) GetFacets(ctx context.Context, params GetFacetsParams) (*GetFacetsResult, error) {
	// Resolve category filter and LLM profile: prefer CategorySlug (subtree), else CanonicalCategory (path)
	var profile *LLMPromptProfile
	var categoryFilterIDs []int
	if params.CategorySlug != "" {
		cat, err := db.GetCategoryBySlug(ctx, strings.TrimSpace(params.CategorySlug))
		if err == nil && cat != nil {
			categoryFilterIDs, _ = db.GetCategorySubtreeIDs(ctx, cat.ID)
			if p, err := db.GetLLMPromptProfileForCategoryID(ctx, cat.ID); err == nil && p != nil {
				profile = p
			}
		}
	} else if params.CanonicalCategory != "" {
		var path []string
		for _, p := range strings.Split(params.CanonicalCategory, " > ") {
			if t := strings.TrimSpace(p); t != "" {
				path = append(path, t)
			}
		}
		if len(path) > 0 {
			if cid, err := db.ResolveCategoryIDFromPath(ctx, path); err == nil && cid != nil {
				categoryFilterIDs = []int{*cid}
				if p, err := db.GetLLMPromptProfileForCategory(ctx, path); err == nil && p != nil {
					profile = p
				}
			}
		}
	}
	params.CategoryFilterIDs = categoryFilterIDs

	var specFiltersForWhere map[string][]string
	if profile != nil {
		specFiltersForWhere = make(map[string][]string)
		for k, v := range params.SpecFilters {
			if k != "" && v != "" {
				specFiltersForWhere[k] = []string{v}
			}
		}
	}
	if specFiltersForWhere == nil {
		specFiltersForWhere = map[string][]string{}
	}

	where, args := buildFacetsWhereClause(params, specFiltersForWhere, true)
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

	// Spec facets: LLM-driven from profile + metadata.llm_specs
	var specFacets []SpecFacet
	if profile != nil {
		fields := parseFilterableFields(profile.ExtractionSchema)
		if len(fields) > 0 {
			allowedKeys := make(map[string]filterableField)
			for _, f := range fields {
				allowedKeys[f.key] = f
			}
			keysArr := make([]string, 0, len(allowedKeys))
			for k := range allowedKeys {
				keysArr = append(keysArr, k)
			}

			specKeyValuesQuery := `
				WITH filtered AS (
					SELECT l.id, l.metadata
					` + baseFrom + `
					AND l.metadata->'llm_specs' IS NOT NULL
					AND jsonb_typeof(l.metadata->'llm_specs') = 'object'
				)
				SELECT spec.key, spec.value, COUNT(DISTINCT f.id) as cnt
				FROM filtered f
				CROSS JOIN LATERAL (
					SELECT e.key, elem.v AS value
					FROM jsonb_each(f.metadata->'llm_specs') AS e(key, value)
					CROSS JOIN LATERAL jsonb_array_elements_text(
						CASE WHEN jsonb_typeof(e.value) = 'array' THEN e.value
						ELSE jsonb_build_array(e.value)
						END
					) AS elem(v)
				) AS spec(key, value)
				WHERE spec.value IS NOT NULL AND trim(spec.value) <> ''
				  AND spec.key = ANY($` + fmt.Sprint(len(args)+1) + `)
				GROUP BY spec.key, spec.value
				ORDER BY spec.key, cnt DESC`
			queryArgs := append(args, pq.Array(keysArr))
			rows, err := db.pool.Query(ctx, specKeyValuesQuery, queryArgs...)
			if err != nil {
				return nil, fmt.Errorf("facets spec key/values: %w", err)
			}

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
					rows.Close()
					return nil, err
				}
				kvs = append(kvs, kv{key: k, value: v, count: c})
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, err
			}

			keyProductCount := make(map[string]int)
			keyValues := make(map[string][]SpecFacetValue)
			for _, r := range kvs {
				if _, ok := allowedKeys[r.key]; !ok {
					continue
				}
				keyProductCount[r.key] += r.count
				if len(keyValues[r.key]) < 50 {
					keyValues[r.key] = append(keyValues[r.key], SpecFacetValue{Value: r.value, Count: r.count})
				}
			}

			const maxKeys = 20
			for i, f := range fields {
				if i >= maxKeys {
					break
				}
				total := keyProductCount[f.key]
				if total == 0 {
					continue
				}
				specFacets = append(specFacets, SpecFacet{
					Key:          f.key,
					Label:        f.label,
					ProductCount: total,
					Values:       keyValues[f.key],
				})
			}
		}
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

	// Variant option facets (Shopify variant_options JSON)
	variantQuery := `
SELECT kv.key, kv.value, COUNT(DISTINCT l.id) as cnt
FROM store_listings l
JOIN stores s ON s.id = l.store_id
CROSS JOIN LATERAL jsonb_each_text(COALESCE(l.variant_options, '{}'::jsonb)) AS kv(key, value)
WHERE 1=1` + where + `
AND l.variant_options IS NOT NULL
AND jsonb_typeof(l.variant_options) = 'object'
AND trim(kv.value) <> ''
GROUP BY kv.key, kv.value
ORDER BY kv.key, cnt DESC`
	vrows, err := db.pool.Query(ctx, variantQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("facets variant options: %w", err)
	}
	defer vrows.Close()

	keyVals := make(map[string][]VariantFacetValue)
	var keyOrder []string
	seenKey := make(map[string]bool)
	for vrows.Next() {
		var k, v string
		var c int
		if err := vrows.Scan(&k, &v, &c); err != nil {
			return nil, err
		}
		if !seenKey[k] {
			seenKey[k] = true
			keyOrder = append(keyOrder, k)
		}
		if len(keyVals[k]) < 50 {
			keyVals[k] = append(keyVals[k], VariantFacetValue{Value: v, Count: c})
		}
	}
	if err := vrows.Err(); err != nil {
		return nil, err
	}
	var variantFacets []VariantFacet
	for _, k := range keyOrder {
		variantFacets = append(variantFacets, VariantFacet{Key: k, Values: keyVals[k]})
	}

	return &GetFacetsResult{
		SpecFacets:      specFacets,
		BrandFacets:     brandFacets,
		VariantFacets:   variantFacets,
		PriceRange:      priceRange,
		TotalMatching:   totalMatching,
	}, nil
}

// appendMetadataSpecFilterConditions appends AND clauses for spec filters on metadata.llm_specs
// or metadata.specs. Stored values may be JSON scalars (string/number) or JSON arrays of strings;
// each filter pattern is matched with ILIKE against scalars or any array element.
func appendMetadataSpecFilterConditions(sb *strings.Builder, args *[]interface{}, argNum *int, specFilters map[string][]string, useLlmSpecs bool) {
	specPath := "'specs'"
	if useLlmSpecs {
		specPath = "'llm_specs'"
	}
	for k, values := range specFilters {
		if k == "" || len(values) == 0 {
			continue
		}
		n := *argNum
		if len(values) == 1 {
			sb.WriteString(fmt.Sprintf(` AND (
  CASE WHEN jsonb_typeof(l.metadata->%s->$%d) = 'array'
  THEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(l.metadata->%s->$%d) AS elem(v)
    WHERE v ILIKE $%d
  )
  ELSE l.metadata->%s->>$%d ILIKE $%d
  END
)`, specPath, n, specPath, n, n+1, specPath, n, n+1))
			*args = append(*args, k, values[0])
			*argNum = n + 2
		} else {
			sb.WriteString(fmt.Sprintf(` AND (
  CASE WHEN jsonb_typeof(l.metadata->%s->$%d) = 'array'
  THEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(l.metadata->%s->$%d) AS elem(v)
    WHERE v ILIKE ANY($%d::text[])
  )
  ELSE (l.metadata->%s->>$%d)::text ILIKE ANY($%d::text[])
  END
)`, specPath, n, specPath, n, n+1, specPath, n, n+1))
			*args = append(*args, k, pq.Array(values))
			*argNum = n + 2
		}
	}
}

// buildFacetsWhereClause returns the WHERE fragment and args for the facets query.
// specFilters maps spec key to values (for ILIKE matching). useLlmSpecs: when true, spec
// filters query metadata->'llm_specs'; when false, metadata->'specs' (legacy).
func buildFacetsWhereClause(params GetFacetsParams, specFilters map[string][]string, useLlmSpecs bool) (string, []interface{}) {
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
	if len(params.CategoryFilterIDs) > 0 {
		sb.WriteString(fmt.Sprintf(" AND l.category_id = ANY($%d)", argNum))
		args = append(args, pq.Array(params.CategoryFilterIDs))
		argNum++
	} else if params.CanonicalCategory != "" {
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
	appendMetadataSpecFilterConditions(&sb, &args, &argNum, specFilters, useLlmSpecs)
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
	appendVariantFilters(&sb, &args, &argNum, params.VariantFilters)

	return sb.String(), args
}

// GetDistinctMetadataValues returns distinct non-empty values for a given metadata key.
// Queries llm_specs (LLM-derived specs).
func (db *DB) GetDistinctMetadataValues(ctx context.Context, key string, limit int) ([]string, error) {
	if key == "" {
		return []string{}, nil
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT v FROM (
			SELECT metadata->'llm_specs'->>$1 AS v
			FROM store_listings
			WHERE metadata->'llm_specs' IS NOT NULL AND jsonb_typeof(metadata->'llm_specs') = 'object'
			  AND metadata->'llm_specs' ? $1
			  AND jsonb_typeof(metadata->'llm_specs'->$1) <> 'array'
			  AND metadata->'llm_specs'->>$1 IS NOT NULL AND trim(metadata->'llm_specs'->>$1::text) <> ''
			UNION ALL
			SELECT elem.v AS v
			FROM store_listings,
			LATERAL jsonb_array_elements_text(metadata->'llm_specs'->$1) AS elem(v)
			WHERE metadata->'llm_specs' IS NOT NULL AND jsonb_typeof(metadata->'llm_specs') = 'object'
			  AND metadata->'llm_specs' ? $1
			  AND jsonb_typeof(metadata->'llm_specs'->$1) = 'array'
		) sub
		WHERE v IS NOT NULL AND trim(v) <> ''
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
