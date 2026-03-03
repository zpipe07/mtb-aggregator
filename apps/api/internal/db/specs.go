package db

import (
	"context"
	"fmt"
)

// GetDistinctMetadataValues returns distinct non-empty values for a given metadata key.
// Used to populate spec-based filter dropdowns.
func (db *DB) GetDistinctMetadataValues(ctx context.Context, key string, limit int) ([]string, error) {
	if key == "" {
		return []string{}, nil
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT metadata->'specs'->>$1 AS v
		FROM store_listings
		WHERE metadata->'specs' IS NOT NULL AND metadata->'specs' ? $1 AND metadata->'specs'->>$1 IS NOT NULL AND metadata->'specs'->>$1 <> ''
		ORDER BY v
		LIMIT %d
	`, limit)

	rows, err := db.pool.Query(ctx, query, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

