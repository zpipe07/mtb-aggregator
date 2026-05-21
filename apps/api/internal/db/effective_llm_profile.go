package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mtb-aggregator/api/internal/llm"
)

// GetCategoryPathNamesRootToLeaf returns category display names from root to the given leaf (inclusive).
func (db *DB) GetCategoryPathNamesRootToLeaf(ctx context.Context, leafID int) ([]string, error) {
	ids, err := db.GetCategoryPathIDsRootToLeaf(ctx, leafID)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		cat, err := db.GetCategoryByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if cat == nil {
			return nil, fmt.Errorf("category %d not found", id)
		}
		names = append(names, cat.Name)
	}
	return names, nil
}

// GetCategoryPathIDsRootToLeaf returns category IDs from root to the given leaf (inclusive).
func (db *DB) GetCategoryPathIDsRootToLeaf(ctx context.Context, leafID int) ([]int, error) {
	var rev []int
	cur := leafID
	seen := make(map[int]struct{})
	for {
		if _, loop := seen[cur]; loop {
			return nil, fmt.Errorf("category cycle detected at id=%d", cur)
		}
		seen[cur] = struct{}{}

		cat, err := db.GetCategoryByID(ctx, cur)
		if err != nil {
			return nil, err
		}
		if cat == nil {
			return nil, fmt.Errorf("category %d not found", cur)
		}
		rev = append(rev, cat.ID)
		if cat.ParentID == nil {
			break
		}
		cur = *cat.ParentID
	}
	for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
		rev[i], rev[j] = rev[j], rev[i]
	}
	return rev, nil
}

// fetchExactEnabledLLMPromptProfileForCategoryID loads one enabled profile for the exact category_id (no inheritance).
func (db *DB) fetchExactEnabledLLMPromptProfileForCategoryID(ctx context.Context, categoryID int) (*LLMPromptProfile, error) {
	var p LLMPromptProfile
	var catFlat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		WHERE category_id = $1 AND enabled = true
	`, categoryID).Scan(&p.ID, &catFlat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = catFlat
	if err := db.maybeHydrateLLMProfile(ctx, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// getEffectiveLLMPromptProfileForCategoryID returns the profile used for extraction/facets:
// extraction_schema merges enabled profiles along the category path (root→leaf); duplicate keys
// use the deepest definition. system_prompt, name, id, and canonical_category come from the
// nearest enabled profile to the leaf (most specific).
func (db *DB) getEffectiveLLMPromptProfileForCategoryID(ctx context.Context, leafCategoryID int) (*LLMPromptProfile, error) {
	path, err := db.GetCategoryPathIDsRootToLeaf(ctx, leafCategoryID)
	if err != nil {
		return nil, err
	}
	if len(path) == 0 {
		return nil, nil
	}

	profiles := make([]*LLMPromptProfile, len(path))
	for i, cid := range path {
		p, err := db.fetchExactEnabledLLMPromptProfileForCategoryID(ctx, cid)
		if err != nil {
			return nil, err
		}
		profiles[i] = p
	}

	var nearest *LLMPromptProfile
	for i := len(profiles) - 1; i >= 0; i-- {
		if profiles[i] != nil {
			nearest = profiles[i]
			break
		}
	}
	if nearest == nil {
		return nil, nil
	}

	tiers := make([][]llm.SchemaField, len(profiles))
	for i, p := range profiles {
		if p == nil {
			continue
		}
		var schema llm.ExtractionSchema
		if err := json.Unmarshal(p.ExtractionSchema, &schema); err != nil {
			return nil, fmt.Errorf("profile id=%d: extraction_schema: %w", p.ID, err)
		}
		tiers[i] = schema.Fields
	}

	mergedFields, err := mergeInheritedSchemaFields(tiers)
	if err != nil {
		return nil, err
	}
	mergedFields, err = db.appendConfidenceToSchemaFields(ctx, mergedFields)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(llm.ExtractionSchema{Fields: mergedFields})
	if err != nil {
		return nil, err
	}

	out := *nearest
	out.ExtractionSchema = raw
	return &out, nil
}