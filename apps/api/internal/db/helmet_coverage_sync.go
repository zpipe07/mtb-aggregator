package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mtb-aggregator/api/internal/metadata"
)

// SyncHelmetCoverage applies model-family Coverage inference (known 3/4 families
// beat a conflicting Half shell override; unmatched titles copy admin overrides
// onto llm_specs) for one listing.
func (db *DB) SyncHelmetCoverage(ctx context.Context, listingID int) error {
	var meta []byte
	var productName string
	var canonical pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT COALESCE(metadata, '{}'::jsonb), COALESCE(product_name, ''), COALESCE(canonical_category, '{}'::text[])
		FROM store_listings WHERE id = $1
	`, listingID).Scan(&meta, &productName, &canonical)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.ApplyHelmetCoverage(meta, productName, []string(canonical))
	if string(merged) == string(meta) {
		return nil
	}
	_, err = db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, listingID)
	return err
}

// BackfillHelmetCoverage rewrites Gear › Helmets llm_specs.coverage from
// InferHelmetCoverage and leftover admin overrides (ZAC-277). Returns the
// number of rows updated.
func (db *DB) BackfillHelmetCoverage(ctx context.Context) (int, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT sl.id, COALESCE(sl.metadata, '{}'::jsonb), COALESCE(sl.product_name, ''), COALESCE(sl.canonical_category, '{}'::text[])
		FROM store_listings sl
		WHERE sl.canonical_category[1] = 'Gear'
		  AND sl.canonical_category[2] = 'Helmets'
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var id int
		var meta []byte
		var productName string
		var canonical pgtype.FlatArray[string]
		if err := rows.Scan(&id, &meta, &productName, &canonical); err != nil {
			return updated, err
		}
		merged := metadata.ApplyHelmetCoverage(meta, productName, []string(canonical))
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
