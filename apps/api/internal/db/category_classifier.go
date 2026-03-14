package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/metadata"
)

// CategoryClassifierConfig is the singleton config for the LLM category classifier.
type CategoryClassifierConfig struct {
	ID                  int
	SystemPrompt        string
	ValidCategories     [][]string
	ConfidenceThreshold float64
	Enabled             bool
}

// ListingForCategoryClassification holds data needed for LLM category classification.
type ListingForCategoryClassification struct {
	ProductName   string
	Metadata      []byte
	CategoryPath  []string // raw breadcrumbs from store
}

// GetCategoryClassifier returns the singleton classifier config, or nil if none exists.
func (db *DB) GetCategoryClassifier(ctx context.Context) (*CategoryClassifierConfig, error) {
	var c CategoryClassifierConfig
	var validCategories []byte
	err := db.pool.QueryRow(ctx, `
		SELECT id, system_prompt, valid_categories, confidence_threshold, enabled
		FROM llm_category_classifier
		ORDER BY id
		LIMIT 1
	`).Scan(&c.ID, &c.SystemPrompt, &validCategories, &c.ConfidenceThreshold, &c.Enabled)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	if len(validCategories) > 0 {
		_ = json.Unmarshal(validCategories, &c.ValidCategories)
	}
	return &c, nil
}

// UpsertCategoryClassifier inserts or updates the singleton classifier config.
// Valid categories are derived at runtime from the categories table; valid_categories/valid_category_ids are no longer written.
func (db *DB) UpsertCategoryClassifier(ctx context.Context, config *CategoryClassifierConfig) error {
	if config.ID > 0 {
		_, err := db.pool.Exec(ctx, `
			UPDATE llm_category_classifier
			SET system_prompt = $1, confidence_threshold = $2, enabled = $3, updated_at = NOW()
			WHERE id = $4
		`, config.SystemPrompt, config.ConfidenceThreshold, config.Enabled, config.ID)
		return err
	}
	// INSERT: valid_categories has NOT NULL default; use empty array
	_, err := db.pool.Exec(ctx, `
		INSERT INTO llm_category_classifier (system_prompt, valid_categories, confidence_threshold, enabled)
		VALUES ($1, '[]'::jsonb, $2, $3)
	`, config.SystemPrompt, config.ConfidenceThreshold, config.Enabled)
	return err
}

// GetListingForCategoryClassification returns listing data needed for category classification.
func (db *DB) GetListingForCategoryClassification(ctx context.Context, id int) (*ListingForCategoryClassification, error) {
	var productName string
	var meta []byte
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT COALESCE(product_name, ''), COALESCE(metadata, '{}'), COALESCE(category_path, '{}')
		FROM store_listings
		WHERE id = $1
	`, id).Scan(&productName, &meta, &cat)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &ListingForCategoryClassification{
		ProductName:  productName,
		Metadata:     meta,
		CategoryPath: cat,
	}, nil
}

// UpdateListingCanonicalCategory updates canonical_category, category_id, and merges llm_category into metadata.
func (db *DB) UpdateListingCanonicalCategory(ctx context.Context, id int, canonical []string, llmCategory map[string]interface{}) error {
	var existing []byte
	if err := db.pool.QueryRow(ctx, `SELECT COALESCE(metadata, '{}') FROM store_listings WHERE id = $1`, id).Scan(&existing); err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.MergeLLMCategory(existing, llmCategory)
	var categoryID interface{}
	if len(canonical) > 0 {
		if cid, err := db.ResolveCategoryIDFromPath(ctx, canonical); err == nil && cid != nil {
			categoryID = *cid
		}
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE store_listings SET canonical_category = $1, category_id = $2, metadata = $3 WHERE id = $4
	`, pq.Array(canonical), categoryID, merged, id)
	return err
}

// UpdateListingLLMCategoryMetadata merges llm_category into metadata without changing canonical_category.
// Used when classification confidence is below threshold (audit trail for admin review).
func (db *DB) UpdateListingLLMCategoryMetadata(ctx context.Context, id int, llmCategory map[string]interface{}) error {
	var existing []byte
	if err := db.pool.QueryRow(ctx, `SELECT COALESCE(metadata, '{}') FROM store_listings WHERE id = $1`, id).Scan(&existing); err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.MergeLLMCategory(existing, llmCategory)
	_, err := db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, id)
	return err
}

// ListListingIDsForCategoryClassifierRun returns listing IDs for batch re-classification.
// store: optional filter by store_type; canonical_category: optional filter; limit: max IDs to return.
func (db *DB) ListListingIDsForCategoryClassifierRun(ctx context.Context, store string, canonicalCategory []string, limit int) ([]int, error) {
	if limit <= 0 {
		limit = 500
	}
	query := `SELECT l.id FROM store_listings l JOIN stores s ON s.id = l.store_id WHERE l.product_url IS NOT NULL AND l.product_url != ''`
	args := []interface{}{}
	argNum := 1
	if store != "" {
		query += fmt.Sprintf(" AND s.store_type = $%d", argNum)
		args = append(args, store)
		argNum++
	}
	if len(canonicalCategory) > 0 {
		query += fmt.Sprintf(" AND l.canonical_category = $%d", argNum)
		args = append(args, pq.Array(canonicalCategory))
		argNum++
	}
	query += fmt.Sprintf(" ORDER BY l.id LIMIT $%d", argNum)
	args = append(args, limit)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
