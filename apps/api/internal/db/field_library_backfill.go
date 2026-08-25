package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/mtb-aggregator/api/internal/llm"
)

// Ambiguous extraction keys → specific names, keyed by structured category_id (profiles + listings).
var fieldLibraryCategoryKeyRenames = map[int]map[string]string{
	27: {"type": "pedal_type"},              // Pedals
	32: {"type": "shock_type"},            // Shocks
	18: {"type": "shoe_type"},            // Shoes
	38: {"material": "handlebar_material"}, // Handlebars
	29: {"material": "pad_material"},      // Brake pads
}

// Library supersets for shared defs (first writer wins via ON CONFLICT DO NOTHING).
var (
	fieldLibraryIntendedUseValues = []string{"XC", "Trail", "Enduro", "DH", "Dirt Jump", "Fat Bike", "E-bike", "BMX"}
	fieldLibraryWheelSizeValues   = []string{"32", "29", "27.5", "MX", "26", "24", "22", "20", "16", "700c", "650b"}
)

// BackfillFieldLibraryStats is returned by BackfillFieldLibrary.
type BackfillFieldLibraryStats struct {
	ProfilesUpdated      int
	ListingsUpdated      int64
	FieldDefsCreated     int
	ProfileFieldRows     int
}

type fieldDefRow struct {
	ID          int
	FieldKey    string
	FieldType   string
	Description string
	Label       *string
	ValuesJSON  []byte
	Filterable  *bool
}

// BackfillFieldLibrary renames ambiguous llm_specs / extraction_schema keys, upserts shared field defs,
// replaces llm_prompt_profile_fields composition rows (confidence is stored as a def only; not composed — hydrate will append),
// and updates extraction_schema JSON on each profile. Idempotent: safe to re-run.
func (db *DB) BackfillFieldLibrary(ctx context.Context) (BackfillFieldLibraryStats, error) {
	var st BackfillFieldLibraryStats

	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return st, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT id, category_id, extraction_schema FROM llm_prompt_profiles ORDER BY id
	`)
	if err != nil {
		return st, err
	}
	defer rows.Close()
	type profileRow struct {
		ID               int
		CategoryID       *int
		ExtractionSchema []byte
	}
	var profiles []profileRow
	for rows.Next() {
		var p profileRow
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.ExtractionSchema); err != nil {
			return st, err
		}
		profiles = append(profiles, p)
	}
	if err := rows.Err(); err != nil {
		return st, err
	}

	for i := range profiles {
		renamed, err := renameExtractionSchemaKeys(profiles[i].CategoryID, profiles[i].ExtractionSchema)
		if err != nil {
			return st, fmt.Errorf("profile id=%d: %w", profiles[i].ID, err)
		}
		if string(renamed) == string(profiles[i].ExtractionSchema) {
			continue
		}
		_, err = tx.Exec(ctx, `
			UPDATE llm_prompt_profiles SET extraction_schema = $1::jsonb, updated_at = NOW() WHERE id = $2
		`, renamed, profiles[i].ID)
		if err != nil {
			return st, fmt.Errorf("profile %d update: %w", profiles[i].ID, err)
		}
		st.ProfilesUpdated++
	}

	for catID, m := range fieldLibraryCategoryKeyRenames {
		for oldKey, newKey := range m {
			// Parenthesize (metadata->'llm_specs') before '-' — otherwise PG parses
			// metadata->('llm_specs' - 'key') and errors with "operator is not unique: unknown - unknown".
			tag, err := tx.Exec(ctx, fmt.Sprintf(`
				UPDATE store_listings
				SET metadata = jsonb_set(
					metadata,
					'{llm_specs}',
					((metadata->'llm_specs') - '%s'::text) || jsonb_build_object('%s', (metadata->'llm_specs')->'%s')
				)
				WHERE category_id = $1
				  AND metadata IS NOT NULL
				  AND metadata->'llm_specs' IS NOT NULL
				  AND jsonb_typeof(metadata->'llm_specs') = 'object'
				  AND metadata->'llm_specs' ? '%s'
			`, oldKey, newKey, oldKey, oldKey), catID)
			if err != nil {
				return st, fmt.Errorf("listings category %d rename %s->%s: %w", catID, oldKey, newKey, err)
			}
			st.ListingsUpdated += tag.RowsAffected()
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM llm_prompt_profile_fields`); err != nil {
		return st, err
	}

	defIDs := make(map[string]int)

	ensure := func(tx pgx.Tx, key string, fieldType, description string, label *string, values []string, filterable *bool) (int, error) {
		if id, ok := defIDs[key]; ok {
			return id, nil
		}
		var valuesJSON interface{}
		if len(values) > 0 {
			b, err := json.Marshal(values)
			if err != nil {
				return 0, err
			}
			valuesJSON = b
		}
		var insertedID int
		qerr := tx.QueryRow(ctx, `
			INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, values, filterable)
			VALUES ($1, $2, $3, $4, $5::jsonb, $6)
			ON CONFLICT (field_key) DO NOTHING
			RETURNING id
		`, key, fieldType, description, label, valuesJSON, filterable).Scan(&insertedID)
		if qerr != nil {
			if errors.Is(qerr, pgx.ErrNoRows) {
				if err := tx.QueryRow(ctx, `SELECT id FROM llm_extraction_field_defs WHERE field_key = $1`, key).Scan(&insertedID); err != nil {
					return 0, err
				}
			} else {
				return 0, qerr
			}
		} else {
			st.FieldDefsCreated++
		}
		defIDs[key] = insertedID
		return insertedID, nil
	}

	// Seed shared defs so intended_use / wheel_size get supersets on first insert.
	_, err = ensure(tx, "intended_use", "enum",
		"Intended use or class of the product.",
		strPtr("Intended use"), fieldLibraryIntendedUseValues, nil)
	if err != nil {
		return st, err
	}
	_, err = ensure(tx, "wheel_size", "enum",
		"Wheel size in inches or conventional label (e.g. 29, 27.5, 700c).",
		strPtr("Wheel Size"), fieldLibraryWheelSizeValues, nil)
	if err != nil {
		return st, err
	}
	_, err = ensure(tx, "confidence", "number",
		"Overall confidence 0-1",
		nil, nil, boolPtr(false))
	if err != nil {
		return st, err
	}
	_, err = ensure(tx, "reasoning", "string",
		"Brief reasoning for the spec extraction",
		strPtr("Reasoning"), nil, boolPtr(false))
	if err != nil {
		return st, err
	}

	for _, pr := range profiles {
		var schema llm.ExtractionSchema
		var raw []byte
		if err := tx.QueryRow(ctx, `SELECT extraction_schema FROM llm_prompt_profiles WHERE id = $1`, pr.ID).Scan(&raw); err != nil {
			return st, err
		}
		if err := json.Unmarshal(raw, &schema); err != nil {
			return st, fmt.Errorf("profile %d unmarshal: %w", pr.ID, err)
		}

		order := 0
		for _, f := range schema.Fields {
			if f.Key == "confidence" || f.Key == "reasoning" {
				continue
			}

			defID, err := ensureFieldDefFromSchema(tx, ctx, &st, &defIDs, f)
			if err != nil {
				return st, fmt.Errorf("profile %d field %q: %w", pr.ID, f.Key, err)
			}

			defRow, err := loadFieldDefRow(tx, ctx, defID)
			if err != nil {
				return st, err
			}

			overrides := overridesDiff(defRow, f)
			overridesJSON := []byte(`{}`)
			if len(overrides) > 0 {
				overridesJSON, err = json.Marshal(overrides)
				if err != nil {
					return st, err
				}
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides, inline_field)
				VALUES ($1, $2, $3, $4::jsonb, NULL)
			`, pr.ID, defID, order, overridesJSON)
			if err != nil {
				return st, fmt.Errorf("profile %d insert row: %w", pr.ID, err)
			}
			st.ProfileFieldRows++
			order++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return st, err
	}
	return st, nil
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func renameExtractionSchemaKeys(categoryID *int, raw []byte) ([]byte, error) {
	if categoryID == nil {
		return raw, nil
	}
	renames := fieldLibraryCategoryKeyRenames[*categoryID]
	if len(renames) == 0 {
		return raw, nil
	}
	var schema llm.ExtractionSchema
	if err := json.Unmarshal(raw, &schema); err != nil {
		return nil, err
	}
	for i := range schema.Fields {
		if nk, ok := renames[schema.Fields[i].Key]; ok {
			schema.Fields[i].Key = nk
		}
	}
	return json.Marshal(schema)
}

func ensureFieldDefFromSchema(tx pgx.Tx, ctx context.Context, st *BackfillFieldLibraryStats, defIDs *map[string]int, f llm.SchemaField) (int, error) {
	if id, ok := (*defIDs)[f.Key]; ok {
		return id, nil
	}

	var valuesJSON interface{}
	if len(f.Values) > 0 {
		b, err := json.Marshal(f.Values)
		if err != nil {
			return 0, err
		}
		valuesJSON = b
	}

	var insertedID int
	qerr := tx.QueryRow(ctx, `
		INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, values, filterable)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6)
		ON CONFLICT (field_key) DO NOTHING
		RETURNING id
	`, f.Key, f.Type, f.Description, emptyLabelPtr(f.Label), valuesJSON, f.Filterable).Scan(&insertedID)
	if qerr != nil {
		if errors.Is(qerr, pgx.ErrNoRows) {
			if err := tx.QueryRow(ctx, `SELECT id FROM llm_extraction_field_defs WHERE field_key = $1`, f.Key).Scan(&insertedID); err != nil {
				return 0, err
			}
		} else {
			return 0, qerr
		}
	} else {
		st.FieldDefsCreated++
	}
	(*defIDs)[f.Key] = insertedID
	return insertedID, nil
}

func emptyLabelPtr(label string) *string {
	if label == "" {
		return nil
	}
	return &label
}

func loadFieldDefRow(tx pgx.Tx, ctx context.Context, id int) (fieldDefRow, error) {
	var r fieldDefRow
	err := tx.QueryRow(ctx, `
		SELECT id, field_key, field_type, description, label, values, filterable
		FROM llm_extraction_field_defs WHERE id = $1
	`, id).Scan(&r.ID, &r.FieldKey, &r.FieldType, &r.Description, &r.Label, &r.ValuesJSON, &r.Filterable)
	return r, err
}

func overridesDiff(def fieldDefRow, f llm.SchemaField) map[string]interface{} {
	out := map[string]interface{}{}
	if f.Type != def.FieldType {
		out["type"] = f.Type
	}
	if f.Description != def.Description {
		out["description"] = f.Description
	}
	defLab := ""
	if def.Label != nil {
		defLab = *def.Label
	}
	if f.Label != defLab {
		out["label"] = f.Label
	}
	var defVals []string
	if len(def.ValuesJSON) > 0 {
		_ = json.Unmarshal(def.ValuesJSON, &defVals)
	}
	if !stringSliceEqual(f.Values, defVals) {
		if len(f.Values) > 0 {
			out["values"] = f.Values
		}
	}
	if !filterableEqual(f.Filterable, def.Filterable) {
		out["filterable"] = f.Filterable
	}
	return out
}

func filterableEqual(f *bool, def *bool) bool {
	return effectiveFilterable(f) == effectiveFilterable(def)
}

func effectiveFilterable(f *bool) bool {
	if f == nil {
		return true
	}
	return *f
}

func stringSliceEqual(a, b []string) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	if len(a) != len(b) {
		return false
	}
	ac, bc := append([]string(nil), a...), append([]string(nil), b...)
	sort.Strings(ac)
	sort.Strings(bc)
	return reflect.DeepEqual(ac, bc)
}
