package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// appendVariantFilters adds AND conditions for variant_options JSON (key matched case-insensitively).
// Multiple values for the same key are OR'd (ILIKE ANY).
func appendVariantFilters(sb *strings.Builder, args *[]interface{}, argNum *int, filters map[string][]string) {
	if filters == nil {
		return
	}
	for k, vals := range filters {
		if k == "" || len(vals) == 0 {
			continue
		}
		var patterns []string
		for _, v := range vals {
			if t := strings.TrimSpace(v); t != "" {
				patterns = append(patterns, t)
			}
		}
		if len(patterns) == 0 {
			continue
		}
		n := *argNum
		if len(patterns) == 1 {
			sb.WriteString(fmt.Sprintf(` AND EXISTS (
  SELECT 1 FROM jsonb_each_text(COALESCE(l.variant_options, '{}'::jsonb)) kv
  WHERE lower(kv.key) = lower($%d) AND kv.value ILIKE $%d
)`, n, n+1))
			*args = append(*args, k, patterns[0])
			*argNum = n + 2
			continue
		}
		sb.WriteString(fmt.Sprintf(` AND EXISTS (
  SELECT 1 FROM jsonb_each_text(COALESCE(l.variant_options, '{}'::jsonb)) kv
  WHERE lower(kv.key) = lower($%d) AND kv.value ILIKE ANY($%d::text[])
)`, n, n+1))
		*args = append(*args, k, pq.Array(patterns))
		*argNum = n + 2
	}
}

// dealsFilterSQL returns AND ... fragments for GetDeals-style filters (after base WHERE).
// nextArg is the next placeholder index to use for ORDER BY / LIMIT.
func (db *DB) dealsFilterSQL(ctx context.Context, params GetDealsParams) (string, []interface{}, int, error) {
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
	if params.CategorySlug != "" {
		cat, err := db.GetCategoryBySlug(ctx, strings.TrimSpace(params.CategorySlug))
		if err == nil && cat != nil {
			subtreeIDs, err := db.GetCategorySubtreeIDs(ctx, cat.ID)
			if err == nil && len(subtreeIDs) > 0 {
				sb.WriteString(fmt.Sprintf(" AND l.category_id = ANY($%d)", argNum))
				args = append(args, pq.Array(subtreeIDs))
				argNum++
			}
		}
	} else if params.CanonicalCategory != "" {
		path := strings.Split(params.CanonicalCategory, " > ")
		trimmed := make([]string, 0, len(path))
		for _, p := range path {
			if t := strings.TrimSpace(p); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		if len(trimmed) > 0 {
			categoryID, err := db.ResolveCategoryIDFromPath(ctx, trimmed)
			if err == nil && categoryID != nil {
				sb.WriteString(fmt.Sprintf(" AND l.category_id = $%d", argNum))
				args = append(args, *categoryID)
				argNum++
			} else {
				sb.WriteString(fmt.Sprintf(" AND l.canonical_category = $%d", argNum))
				args = append(args, pq.Array(trimmed))
				argNum++
			}
		}
	}
	if params.ExcludeCategorySlug != "" {
		cat, err := db.GetCategoryBySlug(ctx, strings.TrimSpace(params.ExcludeCategorySlug))
		if err == nil && cat != nil {
			subtreeIDs, err := db.GetCategorySubtreeIDs(ctx, cat.ID)
			if err == nil && len(subtreeIDs) > 0 {
				sb.WriteString(fmt.Sprintf(" AND (l.category_id IS NULL OR NOT (l.category_id = ANY($%d)))", argNum))
				args = append(args, pq.Array(subtreeIDs))
				argNum++
			}
		}
	}
	specFilters := normalizeSpecFiltersMap(params.SpecFilters)
	appendMetadataSpecFilterConditions(&sb, &args, &argNum, specFilters, true)
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
	if params.Search != "" {
		sb.WriteString(fmt.Sprintf(" AND l.search_vector @@ plainto_tsquery('english', $%d)", argNum))
		args = append(args, params.Search)
		argNum++
	}
	appendVariantFilters(&sb, &args, &argNum, params.VariantFilters)

	return sb.String(), args, argNum, nil
}

func normalizeSpecFiltersMap(m map[string][]string) map[string][]string {
	if m == nil {
		return nil
	}
	out := make(map[string][]string)
	for k, vals := range m {
		if k == "" {
			continue
		}
		var pv []string
		for _, v := range vals {
			if t := strings.TrimSpace(v); t != "" {
				pv = append(pv, t)
			}
		}
		if len(pv) > 0 {
			out[k] = pv
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
