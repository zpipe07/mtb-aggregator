package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/mtb-aggregator/api/internal/llm"
)

// profileFieldJoinQuerier is implemented by *pgxpool.Pool and pgx.Tx.
type profileFieldJoinQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// hydrateExtractionSchema merges llm_prompt_profile_fields + llm_extraction_field_defs into
// {"fields":[...]} for llm.Extract. Appends the shared "confidence" def when missing from composition.
func (db *DB) hydrateExtractionSchema(ctx context.Context, profileID int) (json.RawMessage, error) {
	return db.hydrateExtractionSchemaFrom(ctx, db.pool, profileID)
}

func (db *DB) hydrateExtractionSchemaFrom(ctx context.Context, q profileFieldJoinQuerier, profileID int) (json.RawMessage, error) {
	rows, err := q.Query(ctx, `
		SELECT pf.sort_order, pf.overrides, pf.inline_field,
		       fd.field_key, fd.field_type, fd.description, fd.label, fd.values, fd.filterable, fd.extractable
		FROM llm_prompt_profile_fields pf
		LEFT JOIN llm_extraction_field_defs fd ON fd.id = pf.field_def_id
		WHERE pf.profile_id = $1
		ORDER BY pf.sort_order, pf.id
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fields []llm.SchemaField
	maxSort := 0

	for rows.Next() {
		var sortOrder int
		var overrides []byte
		var inlineField []byte
		var fk, ftype, desc *string
		var label *string
		var valuesJSON []byte
		var filterable *bool
		var extractable *bool

		if err := rows.Scan(&sortOrder, &overrides, &inlineField, &fk, &ftype, &desc, &label, &valuesJSON, &filterable, &extractable); err != nil {
			return nil, err
		}

		if len(inlineField) > 0 {
			var sf llm.SchemaField
			if err := json.Unmarshal(inlineField, &sf); err != nil {
				return nil, fmt.Errorf("inline_field: %w", err)
			}
			sf.SortOrder = sortOrder
			fields = append(fields, sf)
		} else {
			if fk == nil || ftype == nil || desc == nil {
				return nil, fmt.Errorf("profile %d: library row missing field_def join", profileID)
			}
			def := extractionFieldDefRow{
				FieldKey:    *fk,
				FieldType:   *ftype,
				Description: *desc,
				Label:       label,
				ValuesJSON:  valuesJSON,
				Filterable:  filterable,
				Extractable: extractable,
			}
			sf, err := mergeDefOverridesToSchemaField(def, overrides, sortOrder)
			if err != nil {
				return nil, err
			}
			fields = append(fields, sf)
		}
		if sortOrder > maxSort {
			maxSort = sortOrder
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	fields, err = db.appendMetaExtractionFields(ctx, fields, maxSort)
	if err != nil {
		return nil, err
	}

	out, err := json.Marshal(llm.ExtractionSchema{Fields: fields})
	if err != nil {
		return nil, err
	}
	return out, nil
}

type extractionFieldDefRow struct {
	FieldKey    string
	FieldType   string
	Description string
	Label       *string
	ValuesJSON  []byte
	Filterable  *bool
	Extractable *bool
}

func (d *extractionFieldDefRow) toSchemaField(sortOrder int) llm.SchemaField {
	sf := llm.SchemaField{
		Key:         d.FieldKey,
		Type:        d.FieldType,
		Description: d.Description,
		SortOrder:   sortOrder,
	}
	if d.Label != nil {
		sf.Label = *d.Label
	}
	if len(d.ValuesJSON) > 0 {
		_ = json.Unmarshal(d.ValuesJSON, &sf.Values)
	}
	sf.Filterable = d.Filterable
	if d.Extractable != nil && !*d.Extractable {
		v := false
		sf.Extractable = &v
	}
	return sf
}

func mergeDefOverridesToSchemaField(def extractionFieldDefRow, overrides []byte, sortOrder int) (llm.SchemaField, error) {
	sf := def.toSchemaField(sortOrder)
	if err := applySchemaFieldOverrides(&sf, overrides); err != nil {
		return llm.SchemaField{}, err
	}
	return sf, nil
}

func applySchemaFieldOverrides(sf *llm.SchemaField, overrides []byte) error {
	if len(overrides) == 0 || string(overrides) == "{}" {
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(overrides, &m); err != nil {
		return err
	}
	for k, v := range m {
		switch k {
		case "type":
			if err := json.Unmarshal(v, &sf.Type); err != nil {
				return err
			}
		case "description":
			if err := json.Unmarshal(v, &sf.Description); err != nil {
				return err
			}
		case "label":
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return err
			}
			sf.Label = s
		case "values":
			if err := json.Unmarshal(v, &sf.Values); err != nil {
				return err
			}
		case "filterable":
			if err := json.Unmarshal(v, &sf.Filterable); err != nil {
				return err
			}
		case "extractable":
			if err := json.Unmarshal(v, &sf.Extractable); err != nil {
				return err
			}
		}
	}
	return nil
}

// appendMetaExtractionFields strips confidence/reasoning and appends library defs once
// (same source as hydrateExtractionSchemaFrom).
func (db *DB) appendMetaExtractionFields(ctx context.Context, fields []llm.SchemaField, baseSort int) ([]llm.SchemaField, error) {
	filtered := fields[:0]
	maxSort := baseSort
	for _, f := range fields {
		if f.Key == "confidence" || f.Key == "reasoning" {
			continue
		}
		if f.SortOrder > maxSort {
			maxSort = f.SortOrder
		}
		filtered = append(filtered, f)
	}
	for _, key := range []string{"confidence", "reasoning"} {
		def, err := db.loadExtractionFieldDefByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		if def == nil {
			return nil, fmt.Errorf("missing llm_extraction_field_defs row for field_key=%s", key)
		}
		maxSort++
		filtered = append(filtered, def.toSchemaField(maxSort))
	}
	return filtered, nil
}

// appendConfidenceToSchemaFields appends confidence and reasoning meta fields for merged profiles.
func (db *DB) appendConfidenceToSchemaFields(ctx context.Context, fields []llm.SchemaField) ([]llm.SchemaField, error) {
	maxSort := 0
	for _, f := range fields {
		if f.SortOrder > maxSort {
			maxSort = f.SortOrder
		}
	}
	return db.appendMetaExtractionFields(ctx, fields, maxSort)
}

func (db *DB) loadExtractionFieldDefByKey(ctx context.Context, fieldKey string) (*extractionFieldDefRow, error) {
	var d extractionFieldDefRow
	var label *string
	var valuesJSON []byte
	var filterable *bool
	var extractable *bool
	err := db.pool.QueryRow(ctx, `
		SELECT field_key, field_type, description, label, values, filterable, extractable
		FROM llm_extraction_field_defs WHERE field_key = $1
	`, fieldKey).Scan(&d.FieldKey, &d.FieldType, &d.Description, &label, &valuesJSON, &filterable, &extractable)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	d.Label = label
	d.ValuesJSON = valuesJSON
	d.Filterable = filterable
	d.Extractable = extractable
	return &d, nil
}

func (db *DB) countProfileCompositionRows(ctx context.Context, profileID int) (int, error) {
	var n int
	err := db.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM llm_prompt_profile_fields WHERE profile_id = $1
	`, profileID).Scan(&n)
	return n, err
}

// CountLLMPromptProfileFields returns how many composition rows exist for a profile.
func (db *DB) CountLLMPromptProfileFields(ctx context.Context, profileID int) (int, error) {
	return db.countProfileCompositionRows(ctx, profileID)
}

// maybeHydrateLLMProfile replaces p.ExtractionSchema with hydrated JSON when the profile has
// at least one llm_prompt_profile_fields row; otherwise leaves the stored JSONB unchanged.
func (db *DB) maybeHydrateLLMProfile(ctx context.Context, p *LLMPromptProfile) error {
	if p == nil {
		return nil
	}
	n, err := db.countProfileCompositionRows(ctx, p.ID)
	if err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	raw, err := db.hydrateExtractionSchema(ctx, p.ID)
	if err != nil {
		return err
	}
	p.ExtractionSchema = raw
	return nil
}
