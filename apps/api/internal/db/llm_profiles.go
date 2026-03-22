package db

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
)

// LLMPromptProfile is a prompt profile for LLM extraction, keyed by canonical category.
type LLMPromptProfile struct {
	ID                int
	CanonicalCategory []string
	Name              string
	SystemPrompt      string
	ExtractionSchema  json.RawMessage
	Enabled           bool
}

// ListLLMPromptProfiles returns all prompt profiles, ordered by name.
func (db *DB) ListLLMPromptProfiles(ctx context.Context) ([]LLMPromptProfile, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []LLMPromptProfile
	for rows.Next() {
		var p LLMPromptProfile
		var cat pgtype.FlatArray[string]
		if err := rows.Scan(&p.ID, &cat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled); err != nil {
			return nil, err
		}
		p.CanonicalCategory = cat
		list = append(list, p)
	}
	return list, rows.Err()
}

// GetLLMPromptProfileByID returns a profile by id, or nil if not found.
func (db *DB) GetLLMPromptProfileByID(ctx context.Context, id int) (*LLMPromptProfile, error) {
	var p LLMPromptProfile
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		WHERE id = $1
	`, id).Scan(&p.ID, &cat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = cat
	if err := db.maybeHydrateLLMProfile(ctx, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// GetLLMPromptProfileForCategoryID returns an enabled profile for the given category_id.
func (db *DB) GetLLMPromptProfileForCategoryID(ctx context.Context, categoryID int) (*LLMPromptProfile, error) {
	var p LLMPromptProfile
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		WHERE category_id = $1 AND enabled = true
	`, categoryID).Scan(&p.ID, &cat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = cat
	if err := db.maybeHydrateLLMProfile(ctx, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// GetLLMPromptProfileForCategory returns an enabled profile for the given canonical path.
// Resolves path to category_id and looks up by category_id first; falls back to canonical_category match.
func (db *DB) GetLLMPromptProfileForCategory(ctx context.Context, canonicalCategory []string) (*LLMPromptProfile, error) {
	if len(canonicalCategory) == 0 {
		return nil, nil
	}
	if id, err := db.ResolveCategoryIDFromPath(ctx, canonicalCategory); err == nil && id != nil {
		if p, err := db.GetLLMPromptProfileForCategoryID(ctx, *id); err == nil && p != nil {
			return p, nil
		}
	}
	var p LLMPromptProfile
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		WHERE canonical_category = $1 AND enabled = true
	`, pq.Array(canonicalCategory)).Scan(&p.ID, &cat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = cat
	if err := db.maybeHydrateLLMProfile(ctx, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// CreateLLMPromptProfile inserts a profile and returns its id.
// Resolves canonical_category path to category_id and persists both.
func (db *DB) CreateLLMPromptProfile(ctx context.Context, canonicalCategory []string, name, systemPrompt string, extractionSchema json.RawMessage, enabled bool) (int, error) {
	var categoryID *int
	if len(canonicalCategory) > 0 {
		if cid, err := db.ResolveCategoryIDFromPath(ctx, canonicalCategory); err == nil {
			categoryID = cid
		}
	}
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO llm_prompt_profiles (canonical_category, category_id, name, system_prompt, extraction_schema, enabled)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, pq.Array(canonicalCategory), categoryID, name, systemPrompt, extractionSchema, enabled).Scan(&id)
	return id, err
}

// UpdateLLMPromptProfile updates a profile by id.
// Resolves canonical_category path to category_id and persists both.
func (db *DB) UpdateLLMPromptProfile(ctx context.Context, id int, canonicalCategory []string, name, systemPrompt string, extractionSchema json.RawMessage, enabled bool) error {
	var categoryID *int
	if len(canonicalCategory) > 0 {
		if cid, err := db.ResolveCategoryIDFromPath(ctx, canonicalCategory); err == nil {
			categoryID = cid
		}
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE llm_prompt_profiles
		SET canonical_category = $1, category_id = $2, name = $3, system_prompt = $4, extraction_schema = $5, enabled = $6, updated_at = NOW()
		WHERE id = $7
	`, pq.Array(canonicalCategory), categoryID, name, systemPrompt, extractionSchema, enabled, id)
	return err
}

// UpdateLLMPromptProfileMeta updates profile fields except extraction_schema (used when composition owns the schema).
func (db *DB) UpdateLLMPromptProfileMeta(ctx context.Context, id int, canonicalCategory []string, name, systemPrompt string, enabled bool) error {
	var categoryID *int
	if len(canonicalCategory) > 0 {
		if cid, err := db.ResolveCategoryIDFromPath(ctx, canonicalCategory); err == nil {
			categoryID = cid
		}
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE llm_prompt_profiles
		SET canonical_category = $1, category_id = $2, name = $3, system_prompt = $4, enabled = $5, updated_at = NOW()
		WHERE id = $6
	`, pq.Array(canonicalCategory), categoryID, name, systemPrompt, enabled, id)
	return err
}

// DeleteLLMPromptProfile deletes a profile by id.
func (db *DB) DeleteLLMPromptProfile(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM llm_prompt_profiles WHERE id = $1`, id)
	return err
}
