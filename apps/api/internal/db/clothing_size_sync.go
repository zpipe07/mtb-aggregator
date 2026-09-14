package db

import (
	"context"
	"encoding/json"

	"github.com/mtb-aggregator/api/internal/metadata"
)

// SyncClothingSizeFromVariant copies normalized variant Size into metadata.llm_specs.clothing_size
// and splits stored size charts into individual values.
func (db *DB) SyncClothingSizeFromVariant(ctx context.Context, listingID int) error {
	var meta []byte
	var variantOpts []byte
	err := db.pool.QueryRow(ctx, `
		SELECT COALESCE(metadata, '{}'::jsonb), COALESCE(variant_options, '{}'::jsonb)
		FROM store_listings WHERE id = $1
	`, listingID).Scan(&meta, &variantOpts)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.ApplyClothingSizeFromVariant(meta, variantOpts)
	if string(merged) == string(meta) {
		return nil
	}
	_, err = db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, listingID)
	return err
}

// ApplyClothingSizeToListingMetadata merges clothing_size into listing metadata bytes before upsert.
func ApplyClothingSizeToListingMetadata(meta []byte, variantOptions []byte) []byte {
	return metadata.ApplyClothingSizeFromVariant(meta, variantOptions)
}

// BackfillClothingSizeFromVariants sets llm_specs.clothing_size from variant_options
// and re-normalizes stored clothing_size (splits comma size charts into arrays).
func (db *DB) BackfillClothingSizeFromVariants(ctx context.Context) (int, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, COALESCE(metadata, '{}'::jsonb), COALESCE(variant_options, '{}'::jsonb)
		FROM store_listings
		WHERE (
			variant_options IS NOT NULL
			AND variant_options <> '{}'::jsonb
			AND variant_options <> 'null'::jsonb
			AND (variant_options ? 'Size' OR variant_options ? 'size')
		) OR (
			metadata->'llm_specs' ? 'clothing_size'
		)
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var id int
		var meta []byte
		var variantOpts []byte
		if err := rows.Scan(&id, &meta, &variantOpts); err != nil {
			return updated, err
		}
		merged := metadata.ApplyClothingSizeFromVariant(meta, variantOpts)
		if string(merged) == string(meta) {
			continue
		}
		if _, err := db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, id); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// ListingMetadataWithClothingSize is a helper for tests verifying JSON shape.
func ListingMetadataWithClothingSize(size string) []byte {
	b, _ := json.Marshal(map[string]interface{}{
		"llm_specs": map[string]interface{}{"clothing_size": size},
	})
	return b
}
