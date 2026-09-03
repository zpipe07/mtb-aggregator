package db

import (
	"context"
	"encoding/json"

	"github.com/mtb-aggregator/api/internal/metadata"
)

// SyncBikeSizeFromVariant copies normalized variant Size into metadata.llm_specs.bike_size.
func (db *DB) SyncBikeSizeFromVariant(ctx context.Context, listingID int) error {
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
	merged := metadata.ApplyBikeSizeFromVariant(meta, variantOpts)
	if string(merged) == string(meta) {
		return nil
	}
	_, err = db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, listingID)
	return err
}

// ApplyBikeSizeToListingMetadata merges bike_size into listing metadata bytes before upsert.
func ApplyBikeSizeToListingMetadata(meta []byte, variantOptions []byte) []byte {
	return metadata.ApplyBikeSizeFromVariant(meta, variantOptions)
}

// BackfillBikeSizeFromVariants sets llm_specs.bike_size from variant_options for bike-tree listings.
func (db *DB) BackfillBikeSizeFromVariants(ctx context.Context) (int, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT sl.id, COALESCE(sl.metadata, '{}'::jsonb), COALESCE(sl.variant_options, '{}'::jsonb)
		FROM store_listings sl
		WHERE sl.variant_options IS NOT NULL
		  AND sl.variant_options <> '{}'::jsonb
		  AND sl.variant_options <> 'null'::jsonb
		  AND sl.category_id IN (
		    SELECT c.id FROM categories c
		    WHERE c.slug = 'bikes' OR c.slug LIKE 'bikes-%'
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
		merged := metadata.ApplyBikeSizeFromVariant(meta, variantOpts)
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

// ListingMetadataWithBikeSize is a helper for tests verifying JSON shape.
func ListingMetadataWithBikeSize(size string) []byte {
	b, _ := json.Marshal(map[string]interface{}{
		"llm_specs": map[string]interface{}{"bike_size": size},
	})
	return b
}
