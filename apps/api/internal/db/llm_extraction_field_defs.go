package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// LLMExtractionFieldDef is a row in llm_extraction_field_defs.
type LLMExtractionFieldDef struct {
	ID          int             `json:"id"`
	FieldKey    string          `json:"field_key"`
	FieldType   string          `json:"field_type"`
	Description string          `json:"description"`
	Label       *string         `json:"label,omitempty"`
	Values      json.RawMessage `json:"values,omitempty"`
	Filterable  *bool           `json:"filterable,omitempty"`
	Extractable *bool           `json:"extractable,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ListLLMExtractionFieldDefs returns all field defs, optionally filtered by q (ILIKE on field_key and label).
func (db *DB) ListLLMExtractionFieldDefs(ctx context.Context, q string) ([]LLMExtractionFieldDef, error) {
	q = strings.TrimSpace(q)
	var rows pgx.Rows
	var err error
	if q == "" {
		rows, err = db.pool.Query(ctx, `
			SELECT id, field_key, field_type, description, label, values, filterable, extractable, created_at, updated_at
			FROM llm_extraction_field_defs
			ORDER BY field_key
		`)
	} else {
		pattern := "%" + q + "%"
		rows, err = db.pool.Query(ctx, `
			SELECT id, field_key, field_type, description, label, values, filterable, extractable, created_at, updated_at
			FROM llm_extraction_field_defs
			WHERE field_key ILIKE $1 OR COALESCE(label, '') ILIKE $1
			ORDER BY field_key
		`, pattern)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanLLMExtractionFieldDefRows(rows)
}

func scanLLMExtractionFieldDefRows(rows pgx.Rows) ([]LLMExtractionFieldDef, error) {
	var list []LLMExtractionFieldDef
	for rows.Next() {
		var d LLMExtractionFieldDef
		var label *string
		var values []byte
		var filterable *bool
		var extractable *bool
		if err := rows.Scan(&d.ID, &d.FieldKey, &d.FieldType, &d.Description, &label, &values, &filterable, &extractable, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		d.Label = label
		d.Filterable = filterable
		d.Extractable = extractable
		if len(values) > 0 {
			d.Values = values
		}
		list = append(list, d)
	}
	return list, rows.Err()
}

// GetLLMExtractionFieldDefByID returns a field def by id, or nil if not found.
func (db *DB) GetLLMExtractionFieldDefByID(ctx context.Context, id int) (*LLMExtractionFieldDef, error) {
	var d LLMExtractionFieldDef
	var label *string
	var values []byte
	var filterable *bool
	var extractable *bool
	err := db.pool.QueryRow(ctx, `
		SELECT id, field_key, field_type, description, label, values, filterable, extractable, created_at, updated_at
		FROM llm_extraction_field_defs WHERE id = $1
	`, id).Scan(&d.ID, &d.FieldKey, &d.FieldType, &d.Description, &label, &values, &filterable, &extractable, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	d.Label = label
	d.Filterable = filterable
	d.Extractable = extractable
	if len(values) > 0 {
		d.Values = values
	}
	return &d, nil
}

// CreateLLMExtractionFieldDef inserts a field def and returns its id.
func (db *DB) CreateLLMExtractionFieldDef(ctx context.Context, fieldKey, fieldType, description string, label *string, values json.RawMessage, filterable *bool, extractable *bool) (int, error) {
	var valuesJSON interface{}
	if len(values) > 0 {
		valuesJSON = values
	}
	if extractable == nil {
		t := true
		extractable = &t
	}
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, values, filterable, extractable)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
		RETURNING id
	`, fieldKey, fieldType, description, label, valuesJSON, filterable, extractable).Scan(&id)
	return id, err
}

// UpdateLLMExtractionFieldDef updates a field def. field_key is immutable; if fieldKey differs from stored, returns error.
func (db *DB) UpdateLLMExtractionFieldDef(ctx context.Context, id int, fieldKey, fieldType, description string, label *string, values json.RawMessage, filterable *bool, extractable *bool) error {
	existing, err := db.GetLLMExtractionFieldDefByID(ctx, id)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("field def not found")
	}
	if existing.FieldKey != fieldKey {
		return fmt.Errorf("field_key is immutable")
	}
	var valuesJSON interface{}
	if len(values) > 0 {
		valuesJSON = values
	}
	if extractable == nil {
		t := true
		extractable = &t
	}
	_, err = db.pool.Exec(ctx, `
		UPDATE llm_extraction_field_defs
		SET field_type = $2, description = $3, label = $4, values = $5::jsonb, filterable = $6, extractable = $7, updated_at = NOW()
		WHERE id = $1
	`, id, fieldType, description, label, valuesJSON, filterable, extractable)
	return err
}

// ErrFieldDefInUse is returned when DELETE fails due to FK references.
var ErrFieldDefInUse = errors.New("field definition is still referenced by a prompt profile")

// DeleteLLMExtractionFieldDef deletes a field def by id. Returns ErrFieldDefInUse on FK violation.
func (db *DB) DeleteLLMExtractionFieldDef(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM llm_extraction_field_defs WHERE id = $1`, id)
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return ErrFieldDefInUse
	}
	return err
}
