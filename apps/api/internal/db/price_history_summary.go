package db

import "context"

// PriceHistorySummary is aggregate price-history stats for deal scoring on list endpoints.
type PriceHistorySummary struct {
	LowestPrice  float64 `json:"lowest_price"`
	HighestPrice float64 `json:"highest_price"`
	PriceDropped bool    `json:"price_dropped"`
	PointCount   int     `json:"point_count"`
}

func (db *DB) attachPriceHistorySummaries(ctx context.Context, deals []Deal) error {
	if len(deals) == 0 {
		return nil
	}
	ids := make([]int32, len(deals))
	byID := make(map[int]*Deal, len(deals))
	for i := range deals {
		ids[i] = int32(deals[i].ID)
		byID[deals[i].ID] = &deals[i]
	}

	rows, err := db.pool.Query(ctx, `
		WITH deltas AS (
			SELECT
				listing_id,
				price,
				recorded_at,
				LAG(price) OVER (PARTITION BY listing_id ORDER BY recorded_at) AS prev_price
			FROM price_history
			WHERE listing_id = ANY($1)
		)
		SELECT listing_id,
			COUNT(*)::int,
			MIN(price),
			MAX(price),
			COALESCE(
				BOOL_OR(
					prev_price IS NOT NULL
					AND price < prev_price
					AND recorded_at >= NOW() - ($2::int * INTERVAL '1 day')
				),
				false
			)
		FROM deltas
		GROUP BY listing_id
		HAVING COUNT(*) >= 2
	`, ids, defaultPriceDropWithinDays)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var listingID, pointCount int
		var lowest, highest float64
		var dropped bool
		if err := rows.Scan(&listingID, &pointCount, &lowest, &highest, &dropped); err != nil {
			return err
		}
		d := byID[listingID]
		if d == nil {
			continue
		}
		d.PriceHistorySummary = &PriceHistorySummary{
			LowestPrice:  lowest,
			HighestPrice: highest,
			PriceDropped: dropped,
			PointCount:   pointCount,
		}
	}
	return rows.Err()
}
