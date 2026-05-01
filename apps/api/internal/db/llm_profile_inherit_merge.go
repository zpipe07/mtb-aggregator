package db

import (
	"fmt"
	"sort"

	"github.com/mtb-aggregator/api/internal/llm"
)

// mergeInheritedSchemaFields combines per-category field tiers along a root→leaf path.
//
// Semantics (locked for enrichment + facets):
//   - Tiers align with category depth: index 0 is root, last index is leaf.
//   - Nil or empty tiers are skipped.
//   - Field order: for each tier from root to leaf, append that tier's fields in sort_order
//     (then key), skipping keys that appear in any deeper tier (child wins on duplicate key).
//   - "confidence" is excluded here; callers append a single confidence field after merge.
//   - SortOrder on the returned slice is renumbered 1..N for a stable extraction schema.
func mergeInheritedSchemaFields(tiers [][]llm.SchemaField) ([]llm.SchemaField, error) {
	n := len(tiers)
	if n == 0 {
		return nil, nil
	}

	suffixKeys := make([]map[string]struct{}, n)
	acc := make(map[string]struct{})
	for i := n - 1; i >= 0; i-- {
		suffixKeys[i] = copyStringStructSet(acc)
		for _, f := range tiers[i] {
			if f.Key == "" {
				return nil, fmt.Errorf("tier %d: empty field key", i)
			}
			if f.Key == "confidence" {
				continue
			}
			acc[f.Key] = struct{}{}
		}
	}

	var out []llm.SchemaField
	for i := 0; i < n; i++ {
		tier := tiers[i]
		if len(tier) == 0 {
			continue
		}
		suf := suffixKeys[i]
		for _, f := range sortSchemaFieldsTier(tier) {
			if f.Key == "confidence" {
				continue
			}
			if _, deeper := suf[f.Key]; deeper {
				continue
			}
			out = append(out, f)
		}
	}
	for i := range out {
		out[i].SortOrder = i + 1
	}
	return out, nil
}

func copyStringStructSet(m map[string]struct{}) map[string]struct{} {
	if len(m) == 0 {
		return map[string]struct{}{}
	}
	out := make(map[string]struct{}, len(m))
	for k := range m {
		out[k] = struct{}{}
	}
	return out
}

func sortSchemaFieldsTier(fields []llm.SchemaField) []llm.SchemaField {
	out := append([]llm.SchemaField(nil), fields...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Key < out[j].Key
	})
	return out
}
