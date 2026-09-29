package db

import (
	"context"
)

// MaxSitemapListings matches the web sitemap cap (Google’s 50k URL limit minus
// static/hub/category headroom).
const MaxSitemapListings = 48_000

// SitemapListing is the compact PDP row used to build /sitemap.xml deal URLs.
type SitemapListing struct {
	ID          int    `json:"id"`
	LastScraped string `json:"last_scraped"`
}

// ClampSitemapListingsLimit applies the sitemap ID cap. Non-positive or oversized
// values fall back to MaxSitemapListings.
func ClampSitemapListingsLimit(limit int) int {
	if limit <= 0 || limit > MaxSitemapListings {
		return MaxSitemapListings
	}
	return limit
}

// listSitemapListingsSQL selects indexable deal PDPs: in-stock, not hidden, one
// representative per product group (same grouping as GET /deals?group_variants=true).
// Hidden / expired / deleted rows never appear here, so the sitemap cannot submit
// “Deal not found” URLs. Price-history paths are not listings and are not selected.
var listSitemapListingsSQL = `
WITH filtered AS (
  SELECT l.id, l.last_scraped, l.current_price,
         ` + storeVisibleProductGroupKey + ` AS gk
  FROM store_listings l
  WHERE 1=1` + listingVisibilityGate + `
),
ranked AS (
  SELECT id, last_scraped,
         ROW_NUMBER() OVER (PARTITION BY gk ORDER BY current_price ASC NULLS LAST, id ASC) AS rn
  FROM filtered
)
SELECT id, last_scraped::text
FROM ranked
WHERE rn = 1
ORDER BY last_scraped DESC NULLS LAST, id ASC
LIMIT $1
`

// ListSitemapListings returns grouped, shopper-visible listing IDs for the sitemap.
func (db *DB) ListSitemapListings(ctx context.Context, limit int) ([]SitemapListing, error) {
	limit = ClampSitemapListingsLimit(limit)
	rows, err := db.pool.Query(ctx, listSitemapListingsSQL, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SitemapListing
	for rows.Next() {
		var row SitemapListing
		if err := rows.Scan(&row.ID, &row.LastScraped); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []SitemapListing{}
	}
	return out, rows.Err()
}
