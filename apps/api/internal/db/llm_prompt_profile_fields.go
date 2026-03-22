package db

import (
	"context"
	"encoding/json"
	"fmt"
)

// LLMProfileFieldInput is one row for PUT profile composition (library or inline).
type LLMProfileFieldInput struct {
	FieldDefID  *int            `json:"field_def_id"`
	SortOrder   int             `json:"sort_order"`
	Overrides   json.RawMessage `json:"overrides"`
	InlineField json.RawMessage `json:"inline_field"`
}

// LLMPromptProfileFieldRow is a persisted composition row for API responses.
type LLMPromptProfileFieldRow struct {
	ID          int             `json:"id"`
	FieldDefID  *int            `json:"field_def_id,omitempty"`
	FieldKey    *string         `json:"field_key,omitempty"`
	SortOrder   int             `json:"sort_order"`
	Overrides   json.RawMessage `json:"overrides"`
	InlineField json.RawMessage `json:"inline_field,omitempty"`
}

// ListLLMPromptProfileFields returns composition rows for a profile (for admin editor).
func (db *DB) ListLLMPromptProfileFields(ctx context.Context, profileID int) ([]LLMPromptProfileFieldRow, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT pf.id, pf.field_def_id, fd.field_key, pf.sort_order, pf.overrides, pf.inline_field
		FROM llm_prompt_profile_fields pf
		LEFT JOIN llm_extraction_field_defs fd ON fd.id = pf.field_def_id
		WHERE pf.profile_id = $1
		ORDER BY pf.sort_order, pf.id
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []LLMPromptProfileFieldRow
	for rows.Next() {
		var r LLMPromptProfileFieldRow
		var fk *string
		var overrides []byte
		var inline []byte
		if err := rows.Scan(&r.ID, &r.FieldDefID, &fk, &r.SortOrder, &overrides, &inline); err != nil {
			return nil, err
		}
		r.FieldKey = fk
		if len(overrides) > 0 {
			r.Overrides = overrides
		} else {
			r.Overrides = []byte("{}")
		}
		if len(inline) > 0 {
			r.InlineField = inline
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// ReplaceLLMPromptProfileFields replaces all composition rows for a profile. If rows is empty, deletes
// all rows and leaves extraction_schema unchanged (legacy JSON). Otherwise inserts rows and sets
// extraction_schema to the hydrated JSON.
func (db *DB) ReplaceLLMPromptProfileFields(ctx context.Context, profileID int, rows []LLMProfileFieldInput) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM llm_prompt_profile_fields WHERE profile_id = $1`, profileID); err != nil {
		return err
	}
	if len(rows) == 0 {
		return tx.Commit(ctx)
	}

	for i, row := range rows {
		hasInline := len(row.InlineField) > 0 && string(row.InlineField) != "null"
		var fieldDefID interface{}
		if row.FieldDefID != nil && *row.FieldDefID > 0 {
			fieldDefID = *row.FieldDefID
		} else {
			fieldDefID = nil
		}
		if hasInline {
			if fieldDefID != nil {
				return fmt.Errorf("profile_fields[%d]: field_def_id must be null when inline_field is set", i)
			}
		} else {
			if fieldDefID == nil {
				return fmt.Errorf("profile_fields[%d]: field_def_id required when inline_field is empty", i)
			}
		}

		overrides := row.Overrides
		if len(overrides) == 0 {
			overrides = []byte("{}")
		}
		var inlineJSON interface{}
		if hasInline {
			inlineJSON = row.InlineField
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides, inline_field)
			VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
		`, profileID, fieldDefID, row.SortOrder, overrides, inlineJSON); err != nil {
			return err
		}
	}

	raw, err := db.hydrateExtractionSchemaFrom(ctx, tx, profileID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE llm_prompt_profiles SET extraction_schema = $1::jsonb, updated_at = NOW() WHERE id = $2
	`, raw, profileID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
