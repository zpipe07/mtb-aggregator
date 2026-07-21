package db

import (
	"fmt"
	"time"
)

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

// groupedFilteredCTEPrefix returns the leading "WITH …" fragment for getDealsGrouped.
// Must always include WITH so the filtered CTE is valid SQL even when no price-drop CTE is present.
func groupedFilteredCTEPrefix(priceDropFilter bool) string {
	if priceDropFilter {
		return `WITH ` + recentPriceDropsCTE(1) + `,`
	}
	return `WITH `
}

// recentPriceDropsCTE returns SQL for a CTE named recent_price_drops. daysArg is the
// 1-based placeholder index for the within-days interval parameter.
// A listing qualifies when any consecutive scrape pair within the window shows a lower price;
// drop_amount is the largest such decrease in the window.
func recentPriceDropsCTE(daysArg int) string {
	return fmt.Sprintf(`
recent_price_drops AS (
  SELECT DISTINCT ON (listing_id)
    listing_id,
    prev_price - price AS drop_amount,
    recorded_at AS dropped_at
  FROM (
    SELECT
      listing_id,
      price,
      recorded_at,
      LAG(price) OVER (PARTITION BY listing_id ORDER BY recorded_at) AS prev_price
    FROM price_history
    WHERE recorded_at >= NOW() - ($%d::int * INTERVAL '1 day')
  ) price_deltas
  WHERE prev_price IS NOT NULL
    AND price < prev_price
  ORDER BY listing_id, (prev_price - price) DESC, recorded_at DESC
)`, daysArg)
}

// hasPriceDropWithinDays reports whether any consecutive price_history points within
// withinDays show a decrease on the later point.
func hasPriceDropWithinDays(points []PriceHistoryPoint, withinDays int) bool {
	if len(points) < 2 || withinDays <= 0 {
		return false
	}
	cutoff := time.Now().Add(-time.Duration(withinDays) * 24 * time.Hour)
	for i := 1; i < len(points); i++ {
		curr, prev := points[i], points[i-1]
		recordedAt, err := parseRecordedAt(curr.RecordedAt)
		if err != nil || recordedAt.Before(cutoff) {
			continue
		}
		if curr.Price < prev.Price {
			return true
		}
	}
	return false
}

func parseRecordedAt(s string) (time.Time, error) {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05.999999-07:00",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05.999999Z07:00",
	}
	var lastErr error
	for _, layout := range layouts {
		t, err := time.Parse(layout, s)
		if err == nil {
			return t, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}
