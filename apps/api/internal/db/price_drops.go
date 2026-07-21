package db

import "fmt"

const defaultPriceDropWithinDays = 7

// wantsPriceDropFilter is true when the caller requests recent price-drop listings.
func wantsPriceDropFilter(params GetDealsParams) bool {
	if params.Sort == "price_drop" {
		return true
	}
	return params.PriceDropped != nil && *params.PriceDropped
}

func priceDropWithinDays(params GetDealsParams) int {
	if params.PriceDropWithinDays > 0 {
		return params.PriceDropWithinDays
	}
	return defaultPriceDropWithinDays
}

// recentPriceDropsCTE returns SQL for a CTE named recent_price_drops. daysArg is the
// 1-based placeholder index for the within-days interval parameter.
func recentPriceDropsCTE(daysArg int) string {
	return fmt.Sprintf(`
recent_price_drops AS (
  SELECT
    listing_id,
    (ARRAY_AGG(price ORDER BY recorded_at DESC))[2]
      - (ARRAY_AGG(price ORDER BY recorded_at DESC))[1] AS drop_amount,
    (ARRAY_AGG(recorded_at ORDER BY recorded_at DESC))[1] AS dropped_at
  FROM price_history
  GROUP BY listing_id
  HAVING COUNT(*) >= 2
    AND (ARRAY_AGG(price ORDER BY recorded_at DESC))[1]
      < (ARRAY_AGG(price ORDER BY recorded_at DESC))[2]
    AND (ARRAY_AGG(recorded_at ORDER BY recorded_at DESC))[1]
      >= NOW() - ($%d::int * INTERVAL '1 day')
)`, daysArg)
}
