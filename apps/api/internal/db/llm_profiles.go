package db

import (
	"context"
	"encoding/json"

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
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = cat
	return &p, nil
}

// GetLLMPromptProfileForCategory returns an enabled profile whose canonical_category exactly matches.
// Used during enrichment to find the profile for a listing.
func (db *DB) GetLLMPromptProfileForCategory(ctx context.Context, canonicalCategory []string) (*LLMPromptProfile, error) {
	if len(canonicalCategory) == 0 {
		return nil, nil
	}
	var p LLMPromptProfile
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, canonical_category, name, system_prompt, extraction_schema, enabled
		FROM llm_prompt_profiles
		WHERE canonical_category = $1 AND enabled = true
	`, pq.Array(canonicalCategory)).Scan(&p.ID, &cat, &p.Name, &p.SystemPrompt, &p.ExtractionSchema, &p.Enabled)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	p.CanonicalCategory = cat
	return &p, nil
}

// CreateLLMPromptProfile inserts a profile and returns its id.
func (db *DB) CreateLLMPromptProfile(ctx context.Context, canonicalCategory []string, name, systemPrompt string, extractionSchema json.RawMessage, enabled bool) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema, enabled)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, pq.Array(canonicalCategory), name, systemPrompt, extractionSchema, enabled).Scan(&id)
	return id, err
}

// UpdateLLMPromptProfile updates a profile by id.
func (db *DB) UpdateLLMPromptProfile(ctx context.Context, id int, canonicalCategory []string, name, systemPrompt string, extractionSchema json.RawMessage, enabled bool) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE llm_prompt_profiles
		SET canonical_category = $1, name = $2, system_prompt = $3, extraction_schema = $4, enabled = $5, updated_at = NOW()
		WHERE id = $6
	`, pq.Array(canonicalCategory), name, systemPrompt, extractionSchema, enabled, id)
	return err
}

// DeleteLLMPromptProfile deletes a profile by id.
func (db *DB) DeleteLLMPromptProfile(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM llm_prompt_profiles WHERE id = $1`, id)
	return err
}
