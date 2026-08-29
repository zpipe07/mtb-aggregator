package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/metadata"
)

const (
	// BikesOnlineStoreType is the store_type for Bikes Online (Shopify sale collection).
	BikesOnlineStoreType = "bikesonline"
	// BikesOnlineClothingProtectivePath is Shopify product_type shared by apparel and protective gear.
	BikesOnlineClothingProtectivePath = "Clothing & Protective Gear"
)

// BikesOnlineClothingProtectiveLLMPaths are live Gear leaves we apply from metadata.llm_category.
var BikesOnlineClothingProtectiveLLMPaths = [][]string{
	{"Gear", "Protection"},
	{"Gear", "Helmets"},
	{"Gear", "Gloves"},
}

// BikesOnlineClothingProtectiveApplyResult summarizes a targeted LLM category apply run.
type BikesOnlineClothingProtectiveApplyResult struct {
	DryRun          bool
	Applied         int
	RequeuedExtract int
	ByLLMPath       map[string]int
}

func llmPathAllowedForBikesOnlineRepair(llm []string) bool {
	for _, allowed := range BikesOnlineClothingProtectiveLLMPaths {
		if sliceEqual(llm, allowed) {
			return true
		}
	}
	return false
}

// ShouldPreserveCanonicalForBackfill reports whether path-based recategorize should skip a listing
// (manual admin override or confident prior LLM classification).
func ShouldPreserveCanonicalForBackfill(meta []byte, threshold float64) bool {
	if metadata.HasManualCategoryOverride(meta) {
		return true
	}
	_, conf, ok := llmCategoryFromMetadata(meta)
	return ok && conf >= threshold
}

func (db *DB) resolveLLMPreserveThreshold(ctx context.Context) float64 {
	cfg, _ := db.GetCategoryClassifier(ctx)
	return resolveLLMCategoryPreserveThreshold("", cfg)
}

type bikesOnlineClothingProtectiveCandidate struct {
	ID       int
	LLMPath  []string
	Meta     []byte
	LLMCat   map[string]interface{}
}

func (db *DB) listBikesOnlineClothingProtectiveCandidates(ctx context.Context, threshold float64) ([]bikesOnlineClothingProtectiveCandidate, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT l.id, COALESCE(l.metadata, '{}'::jsonb),
			ARRAY(SELECT jsonb_array_elements_text(l.metadata->'llm_category'->'canonical_category')) AS llm_path
		FROM store_listings l
		INNER JOIN stores s ON s.id = l.store_id
		WHERE s.store_type = $1
		  AND l.category_path = $2::text[]
		  AND l.metadata->'llm_category'->'canonical_category' IS NOT NULL
		  AND jsonb_typeof(l.metadata->'llm_category'->'canonical_category') = 'array'
		  AND (l.metadata->'llm_category'->>'confidence')::float >= $3
		  AND COALESCE((l.metadata->>'manual_category_override')::boolean, false) = false
		  AND l.canonical_category IS DISTINCT FROM (
			ARRAY(SELECT jsonb_array_elements_text(l.metadata->'llm_category'->'canonical_category'))
		  )
		ORDER BY l.id
	`, BikesOnlineStoreType, pq.Array([]string{BikesOnlineClothingProtectivePath}), threshold)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []bikesOnlineClothingProtectiveCandidate
	for rows.Next() {
		var c bikesOnlineClothingProtectiveCandidate
		var llmPath pgtype.FlatArray[string]
		if err := rows.Scan(&c.ID, &c.Meta, &llmPath); err != nil {
			return out, err
		}
		c.LLMPath = []string(llmPath)
		if !llmPathAllowedForBikesOnlineRepair(c.LLMPath) {
			continue
		}
		var root map[string]interface{}
		if err := json.Unmarshal(c.Meta, &root); err != nil {
			continue
		}
		lm, _ := root["llm_category"].(map[string]interface{})
		if lm == nil {
			continue
		}
		c.LLMCat = lm
		out = append(out, c)
	}
	return out, rows.Err()
}

// BackfillBikesOnlineClothingProtectiveLLM applies confident LLM Gear sibling categories for Bikes Online
// listings stuck on Gear > Clothing due to the combined Shopify product_type breadcrumb.
func (db *DB) BackfillBikesOnlineClothingProtectiveLLM(ctx context.Context, dryRun bool) (BikesOnlineClothingProtectiveApplyResult, error) {
	threshold := db.resolveLLMPreserveThreshold(ctx)
	candidates, err := db.listBikesOnlineClothingProtectiveCandidates(ctx, threshold)
	if err != nil {
		return BikesOnlineClothingProtectiveApplyResult{}, err
	}

	result := BikesOnlineClothingProtectiveApplyResult{
		DryRun:    dryRun,
		ByLLMPath: make(map[string]int),
	}
	for _, c := range candidates {
		key := strings.Join(c.LLMPath, " > ")
		result.ByLLMPath[key]++
	}

	if dryRun {
		result.Applied = len(candidates)
		return result, nil
	}

	var appliedIDs []int
	for _, c := range candidates {
		cid, err := db.ResolveCategoryIDFromPath(ctx, c.LLMPath)
		if err != nil {
			return result, fmt.Errorf("listing %d: resolve category %v: %w", c.ID, c.LLMPath, err)
		}
		if cid == nil {
			return result, fmt.Errorf("listing %d: unknown category path %v", c.ID, c.LLMPath)
		}
		if err := db.UpdateListingCanonicalCategory(ctx, c.ID, c.LLMPath, c.LLMCat); err != nil {
			return result, fmt.Errorf("listing %d: update canonical: %w", c.ID, err)
		}
		appliedIDs = append(appliedIDs, c.ID)
		result.Applied++
	}

	if len(appliedIDs) > 0 {
		n, err := db.RequeueExtractForListings(ctx, appliedIDs)
		if err != nil {
			return result, fmt.Errorf("requeue extract: %w", err)
		}
		result.RequeuedExtract = n
	}

	return result, nil
}

// RequeueExtractForListings clears extract step completion so LLM spec extraction runs again after category moves.
func (db *DB) RequeueExtractForListings(ctx context.Context, listingIDs []int) (int, error) {
	if len(listingIDs) == 0 {
		return 0, nil
	}
	for _, id := range listingIDs {
		_, err := db.pool.Exec(ctx, `
			INSERT INTO listing_enrichment (listing_id)
			VALUES ($1)
			ON CONFLICT (listing_id) DO NOTHING
		`, id)
		if err != nil {
			return 0, err
		}
	}
	tag, err := db.pool.Exec(ctx, `
		UPDATE listing_enrichment SET
			extracted_at = NULL,
			extract_attempts = 0,
			extract_error = NULL,
			next_extract_attempt_at = NULL,
			extract_dead = false,
			extract_leased_until = NULL,
			updated_at = NOW()
		WHERE listing_id = ANY($1)
	`, pq.Array(listingIDs))
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// LogBikesOnlineClothingProtectiveApplyResult prints dry-run or apply summary lines.
func LogBikesOnlineClothingProtectiveApplyResult(r BikesOnlineClothingProtectiveApplyResult) {
	prefix := "apply"
	if r.DryRun {
		prefix = "dry-run"
	}
	log.Printf("[bikesonline-clothing-protective] %s: would apply %d listings", prefix, r.Applied)
	for path, n := range r.ByLLMPath {
		log.Printf("[bikesonline-clothing-protective]   %s: %d", path, n)
	}
	if !r.DryRun && r.RequeuedExtract > 0 {
		log.Printf("[bikesonline-clothing-protective] requeued extract for %d listings", r.RequeuedExtract)
	}
}
