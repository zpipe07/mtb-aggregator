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
	Brands            []string // OR within brands (ILIKE ANY)
	Category          string
	CanonicalCategory string // legacy: "Bikes > Mountain"
	CategorySlug      string // preferred: slug for subtree filter
	MinDiscount       *float64
	MinPrice          *float64 // minimum current_price (inclusive)
	MaxPrice          *float64 // maximum current_price (inclusive)
	Search            string
	SpecFilters       map[string][]string // key -> values; OR within key
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

// GetFacetsResult is the response for GET /facets.
type GetFacetsResult struct {
	SpecFacets    []SpecFacet  `json:"spec_facets"`
	BrandFacets   []BrandFacet `json:"brand_facets"`
	PriceRange    PriceRange   `json:"price_range"`
	TotalMatching int          `json:"total_matching"`
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

// listingVisibilityGate limits queries to in-stock, non-hidden listings (same rules as GET /deals).
const listingVisibilityGate = " AND l.is_in_stock = true AND l.hidden = false"

// facetsListingGate prefixes facet WHERE clauses with the same visibility rules as public GET /deals
// (in-stock, not hidden). whereFromBuild is the suffix from buildFacetsWhereClause (may be empty).
func facetsListingGate(whereFromBuild string) string {
	if whereFromBuild == "" {
		return listingVisibilityGate
	}
	return listingVisibilityGate + whereFromBuild
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
		specFiltersForWhere = normalizeSpecFiltersMap(params.SpecFilters)
	}
	if specFiltersForWhere == nil {
		specFiltersForWhere = map[string][]string{}
	}

	where, args := buildFacetsWhereClause(params, specFiltersForWhere, true)
	where = facetsListingGate(where)

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

	// Spec facets: LLM-driven from profile + effective specs (llm_overrides win over llm_specs).
	// For each filterable key, aggregate values using a WHERE clause that omits that key's spec
	// filter so the user can switch values (faceted search), matching brand_facets behavior.
	var specFacets []SpecFacet
	if profile != nil {
		fields := parseFilterableFields(profile.ExtractionSchema)
		const maxKeys = 20
		effectiveSpecs := effectiveLLMSpecsExpr("f.metadata")
		for i, f := range fields {
			if i >= maxKeys {
				break
			}
			specWhere, specArgs := buildFacetsWhereClause(params, specFiltersOmit(specFiltersForWhere, f.key), true)
			specWhere = facetsListingGate(specWhere)
			baseFromSpec := `
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1` + specWhere

			specKeyValuesQuery := `
				WITH filtered AS (
					SELECT l.id, l.metadata
					` + baseFromSpec + `
					AND jsonb_typeof(` + effectiveLLMSpecsExpr("l.metadata") + `) = 'object'
					AND ` + effectiveLLMSpecsExpr("l.metadata") + ` <> '{}'::jsonb
				)
				SELECT spec.value, COUNT(DISTINCT f.id) as cnt
				FROM filtered f
				CROSS JOIN LATERAL (
					SELECT e.key, elem.v AS value
					FROM jsonb_each(` + effectiveSpecs + `) AS e(key, value)
					CROSS JOIN LATERAL jsonb_array_elements_text(
						CASE WHEN jsonb_typeof(e.value) = 'array' THEN e.value
						ELSE jsonb_build_array(e.value)
						END
					) AS elem(v)
				) AS spec(key, value)
				WHERE spec.value IS NOT NULL AND trim(spec.value) <> ''
				  AND spec.key = $` + fmt.Sprint(len(specArgs)+1) + `
				GROUP BY spec.value
				ORDER BY cnt DESC
				LIMIT 50`
			queryArgs := append(specArgs, f.key)
			rows, err := db.pool.Query(ctx, specKeyValuesQuery, queryArgs...)
			if err != nil {
				return nil, fmt.Errorf("facets spec key/values for %s: %w", f.key, err)
			}

			var values []SpecFacetValue
			total := 0
			for rows.Next() {
				var v string
				var c int
				if err := rows.Scan(&v, &c); err != nil {
					rows.Close()
					return nil, err
				}
				values = append(values, SpecFacetValue{Value: v, Count: c})
				total += c
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if total == 0 {
				continue
			}
			specFacets = append(specFacets, SpecFacet{
				Key:          f.key,
				Label:        f.label,
				ProductCount: total,
				Values:       values,
			})
		}
	}

	// Brand facets — exclude brand filter so users can see/switch alternatives (faceted search).
	brandParams := params
	brandParams.Brands = nil
	brandWhere, brandArgs := buildFacetsWhereClause(brandParams, specFiltersForWhere, true)
	brandWhere = facetsListingGate(brandWhere)
	brandBaseFrom := `
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1` + brandWhere

	brandQuery := `
		SELECT l.brand, COUNT(*) as cnt
		` + brandBaseFrom + `
		AND l.brand IS NOT NULL AND trim(l.brand) <> ''
		GROUP BY l.brand
		ORDER BY cnt DESC
		LIMIT 50`
	rows2, err := db.pool.Query(ctx, brandQuery, brandArgs...)
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
		SpecFacets:    specFacets,
		BrandFacets:   brandFacets,
		PriceRange:    priceRange,
		TotalMatching: totalMatching,
	}, nil
}

// specFiltersOmit returns a copy of specFilters without the given key (for faceted spec value lists).
func specFiltersOmit(specFilters map[string][]string, omitKey string) map[string][]string {
	if omitKey == "" {
		return specFilters
	}
	out := make(map[string][]string, len(specFilters))
	for k, v := range specFilters {
		if k == omitKey {
			continue
		}
		out[k] = v
	}
	return out
}

// effectiveLLMSpecsExpr is the JSON object shoppers and facets should read: llm_overrides
// keys replace llm_specs (admin corrections must win on /deals and /facets).
func effectiveLLMSpecsExpr(metadataExpr string) string {
	return fmt.Sprintf(
		`(COALESCE(%[1]s->'llm_specs', '{}'::jsonb) || COALESCE(CASE WHEN jsonb_typeof(%[1]s->'llm_overrides') = 'object' THEN %[1]s->'llm_overrides' ELSE '{}'::jsonb END, '{}'::jsonb))`,
		metadataExpr,
	)
}

// appendMetadataSpecFilterConditions appends AND clauses for spec filters on metadata.llm_specs
// (with llm_overrides winning when useLlmSpecs) or metadata.specs. Stored values may be JSON
// scalars (string/number) or JSON arrays of strings; each filter pattern is matched with ILIKE
// against scalars or any array element.
func appendMetadataSpecFilterConditions(sb *strings.Builder, args *[]interface{}, argNum *int, specFilters map[string][]string, useLlmSpecs bool) {
	specExpr := "l.metadata->'specs'"
	if useLlmSpecs {
		specExpr = effectiveLLMSpecsExpr("l.metadata")
	}
	for k, values := range specFilters {
		if k == "" || len(values) == 0 {
			continue
		}
		n := *argNum
		if len(values) == 1 {
			sb.WriteString(fmt.Sprintf(` AND (
  CASE WHEN jsonb_typeof(%[1]s->$%[2]d) = 'array'
  THEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(%[1]s->$%[2]d) AS elem(v)
    WHERE v ILIKE $%[3]d
  )
  ELSE %[1]s->>$%[2]d ILIKE $%[3]d
  END
)`, specExpr, n, n+1))
			*args = append(*args, k, values[0])
			*argNum = n + 2
		} else {
			sb.WriteString(fmt.Sprintf(` AND (
  CASE WHEN jsonb_typeof(%[1]s->$%[2]d) = 'array'
  THEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(%[1]s->$%[2]d) AS elem(v)
    WHERE v ILIKE ANY($%[3]d::text[])
  )
  ELSE (%[1]s->>$%[2]d)::text ILIKE ANY($%[3]d::text[])
  END
)`, specExpr, n, n+1))
			*args = append(*args, k, pq.Array(values))
			*argNum = n + 2
		}
	}
}

// buildFacetsWhereClause returns the WHERE fragment and args for the facets query.
// specFilters maps spec key to values (for ILIKE matching). useLlmSpecs: when true, spec
// filters query effective LLM specs (llm_overrides || llm_specs); when false, metadata->'specs' (legacy).
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
	var brands []string
	for _, b := range params.Brands {
		if t := strings.TrimSpace(b); t != "" {
			brands = append(brands, t)
		}
	}
	if len(brands) > 0 {
		sb.WriteString(fmt.Sprintf(" AND l.brand ILIKE ANY($%d::text[])", argNum))
		args = append(args, pq.Array(brands))
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
	if params.MinPrice != nil && *params.MinPrice > 0 {
		sb.WriteString(fmt.Sprintf(" AND l.current_price >= $%d", argNum))
		args = append(args, *params.MinPrice)
		argNum++
	}
	if params.MaxPrice != nil && *params.MaxPrice > 0 {
		sb.WriteString(fmt.Sprintf(" AND l.current_price <= $%d", argNum))
		args = append(args, *params.MaxPrice)
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
// Queries effective LLM specs (llm_overrides win over llm_specs).
func (db *DB) GetDistinctMetadataValues(ctx context.Context, key string, limit int) ([]string, error) {
	if key == "" {
		return []string{}, nil
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	eff := effectiveLLMSpecsExpr("metadata")
	query := fmt.Sprintf(`
		SELECT DISTINCT v FROM (
			SELECT %s->>$1 AS v
			FROM store_listings
			WHERE jsonb_typeof(%s) = 'object'
			  AND %s ? $1
			  AND jsonb_typeof(%s->$1) <> 'array'
			  AND %s->>$1 IS NOT NULL AND trim(%s->>$1) <> ''
			UNION ALL
			SELECT elem.v AS v
			FROM store_listings,
			LATERAL jsonb_array_elements_text(%s->$1) AS elem(v)
			WHERE jsonb_typeof(%s) = 'object'
			  AND %s ? $1
			  AND jsonb_typeof(%s->$1) = 'array'
		) sub
		WHERE v IS NOT NULL AND trim(v) <> ''
		ORDER BY v
		LIMIT %d
	`, eff, eff, eff, eff, eff, eff, eff, eff, eff, eff, limit)

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
