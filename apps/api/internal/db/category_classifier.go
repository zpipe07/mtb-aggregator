package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/metadata"
)

// ErrUnresolvedCategoryPath means canonical did not match a categories row.
// Callers must not persist that path with category_id NULL (ZAC-298).
var ErrUnresolvedCategoryPath = errors.New("canonical category did not resolve to a category id")

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
	ProductName  string
	Metadata     []byte
	CategoryPath []string // raw breadcrumbs from store
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

// resolvedCategoryID returns a category id only when the canonical path matched
// a tree node. A miss must not be written as category_id NULL.
func resolvedCategoryID(canonical []string, id *int, resolveErr error) (int, error) {
	if resolveErr != nil {
		return 0, resolveErr
	}
	if len(canonical) == 0 || id == nil {
		return 0, fmt.Errorf("%w: %v", ErrUnresolvedCategoryPath, canonical)
	}
	return *id, nil
}

// UpdateListingCanonicalCategory updates canonical_category, category_id, and merges llm_category into metadata.
func (db *DB) UpdateListingCanonicalCategory(ctx context.Context, id int, canonical []string, llmCategory map[string]interface{}) error {
	var existing []byte
	if err := db.pool.QueryRow(ctx, `SELECT COALESCE(metadata, '{}') FROM store_listings WHERE id = $1`, id).Scan(&existing); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("listing %d not found", id)
		}
		return err
	}
	cid, err := db.ResolveCategoryIDFromPath(ctx, canonical)
	if err != nil {
		return err
	}
	categoryID, err := resolvedCategoryID(canonical, cid, nil)
	if err != nil {
		return err
	}
	merged := metadata.MergeLLMCategory(existing, llmCategory)
	_, err = db.pool.Exec(ctx, `
		UPDATE store_listings SET canonical_category = $1, category_id = $2, metadata = $3 WHERE id = $4
	`, pq.Array(canonical), categoryID, merged, id)
	return err
}

// UpdateListingCategoryManual sets canonical_category and category_id from an admin category picker.
// Sets metadata.manual_category_override for future enrichment lock semantics.
// Also updates non-hidden siblings sharing the same store_id and product_group_key.
// Returns the number of sibling rows updated (excluding the target listing).
func (db *DB) UpdateListingCategoryManual(ctx context.Context, listingID int, categoryID int) (siblingsUpdated int, err error) {
	path, err := db.GetCategoryPathNamesRootToLeaf(ctx, categoryID)
	if err != nil {
		return 0, err
	}
	if len(path) == 0 {
		return 0, fmt.Errorf("category %d not found", categoryID)
	}
	var existing []byte
	var storeID int
	var groupKey *string
	err = db.pool.QueryRow(ctx, `
		SELECT COALESCE(metadata, '{}'), store_id, product_group_key
		FROM store_listings WHERE id = $1
	`, listingID).Scan(&existing, &storeID, &groupKey)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return 0, fmt.Errorf("listing not found")
		}
		return 0, err
	}
	merged := metadata.MergeManualCategoryOverride(existing)
	tag, err := db.pool.Exec(ctx, `
		UPDATE store_listings SET canonical_category = $1, category_id = $2, metadata = $3 WHERE id = $4
	`, pq.Array(path), categoryID, merged, listingID)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, fmt.Errorf("listing not found")
	}
	if groupKey != nil && strings.TrimSpace(*groupKey) != "" {
		sibTag, err := db.pool.Exec(ctx, `
			UPDATE store_listings
			SET canonical_category = $1, category_id = $2,
			    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{manual_category_override}', 'true'::jsonb, true)
			WHERE store_id = $3 AND product_group_key = $4 AND id != $5 AND hidden = false
		`, pq.Array(path), categoryID, storeID, *groupKey, listingID)
		if err != nil {
			return 0, err
		}
		siblingsUpdated = int(sibTag.RowsAffected())
	}
	return siblingsUpdated, nil
}

// BulkSetListingsCategory applies manual category assignment to many listings by id.
func (db *DB) BulkSetListingsCategory(ctx context.Context, categoryID int, listingIDs []int) (updated int, err error) {
	if len(listingIDs) == 0 {
		return 0, nil
	}
	path, err := db.GetCategoryPathNamesRootToLeaf(ctx, categoryID)
	if err != nil {
		return 0, err
	}
	if len(path) == 0 {
		return 0, fmt.Errorf("category %d not found", categoryID)
	}
	tag, err := db.pool.Exec(ctx, `
		UPDATE store_listings
		SET canonical_category = $1, category_id = $2,
		    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{manual_category_override}', 'true'::jsonb, true)
		WHERE id = ANY($3)
	`, pq.Array(path), categoryID, pq.Array(listingIDs))
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
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

// CategoryClassifierRunParams filters listings for batch or preview re-classification.
type CategoryClassifierRunParams struct {
	Store                 string
	CanonicalCategory     []string
	IDs                   []int
	HasEnrichment         *bool // true = last_enriched_at set; false = not enriched
	MinMetadataConfidence *float64
	MaxMetadataConfidence *float64
	// LlmConfidenceBelow matches GetAdminListings: (metadata->>'llm_confidence')::float < v
	LlmConfidenceBelow *float64
	Limit              int
}

// classifierListingFromWhere returns the FROM...WHERE portion shared by list/count/preview queries.
func classifierListingFromWhere(p CategoryClassifierRunParams, argNum int) (string, []interface{}, int) {
	query := ` FROM store_listings l JOIN stores s ON s.id = l.store_id WHERE l.product_url IS NOT NULL AND l.product_url != ''`
	args := []interface{}{}
	if len(p.IDs) > 0 {
		query += fmt.Sprintf(" AND l.id = ANY($%d)", argNum)
		args = append(args, pq.Array(p.IDs))
		argNum++
	}
	if p.Store != "" {
		query += fmt.Sprintf(" AND s.store_type = $%d", argNum)
		args = append(args, p.Store)
		argNum++
	}
	if len(p.CanonicalCategory) > 0 {
		query += fmt.Sprintf(" AND l.canonical_category = $%d", argNum)
		args = append(args, pq.Array(p.CanonicalCategory))
		argNum++
	}
	if p.HasEnrichment != nil {
		if *p.HasEnrichment {
			query += " AND l.last_enriched_at IS NOT NULL"
		} else {
			query += " AND l.last_enriched_at IS NULL"
		}
	}
	if p.MinMetadataConfidence != nil {
		query += fmt.Sprintf(" AND (l.metadata->>'llm_confidence') IS NOT NULL AND (l.metadata->>'llm_confidence')::float >= $%d", argNum)
		args = append(args, *p.MinMetadataConfidence)
		argNum++
	}
	if p.MaxMetadataConfidence != nil {
		query += fmt.Sprintf(" AND (l.metadata->>'llm_confidence') IS NOT NULL AND (l.metadata->>'llm_confidence')::float <= $%d", argNum)
		args = append(args, *p.MaxMetadataConfidence)
		argNum++
	}
	if p.LlmConfidenceBelow != nil {
		query += fmt.Sprintf(" AND (l.metadata->>'llm_confidence')::float < $%d", argNum)
		args = append(args, *p.LlmConfidenceBelow)
		argNum++
	}
	return query, args, argNum
}

// ListListingIDsForCategoryClassifierRun returns listing IDs for batch re-classification.
func (db *DB) ListListingIDsForCategoryClassifierRun(ctx context.Context, p CategoryClassifierRunParams) ([]int, error) {
	limit := p.Limit
	if limit <= 0 {
		limit = 500
	}
	fromWhere, args, argNum := classifierListingFromWhere(p, 1)
	query := "SELECT l.id" + fromWhere + fmt.Sprintf(" ORDER BY l.id LIMIT $%d", argNum)
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

// CountListingsForCategoryClassifierRun returns how many listings match the classifier filters.
func (db *DB) CountListingsForCategoryClassifierRun(ctx context.Context, p CategoryClassifierRunParams) (int, error) {
	fromWhere, args, _ := classifierListingFromWhere(p, 1)
	countQuery := "SELECT COUNT(*)" + fromWhere
	var n int
	err := db.pool.QueryRow(ctx, countQuery, args...).Scan(&n)
	return n, err
}

// ClassifierRunPreviewSample is a small preview row for admin dry-run.
type ClassifierRunPreviewSample struct {
	ID          int    `json:"id"`
	ProductName string `json:"product_name"`
}

// ListSampleForCategoryClassifierRun returns up to n sample rows (id, product_name) for preview.
func (db *DB) ListSampleForCategoryClassifierRun(ctx context.Context, p CategoryClassifierRunParams, sampleLimit int) ([]ClassifierRunPreviewSample, error) {
	if sampleLimit <= 0 {
		sampleLimit = 10
	}
	fromWhere, args, argNum := classifierListingFromWhere(p, 1)
	query := "SELECT l.id, COALESCE(l.product_name, '')" + fromWhere + fmt.Sprintf(" ORDER BY l.id LIMIT $%d", argNum)
	args = append(args, sampleLimit)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClassifierRunPreviewSample
	for rows.Next() {
		var s ClassifierRunPreviewSample
		if err := rows.Scan(&s.ID, &s.ProductName); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
