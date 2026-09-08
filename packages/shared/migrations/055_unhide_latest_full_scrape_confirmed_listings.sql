-- ZAC-270: Unhide listings confirmed by each store's latest *full* scrape.
-- Migration 047 keys off the latest completed job with listings_upserted >= 10.
-- A thin Jenson scrape (job 2608: 149 rows in 46s) still clears that floor, so
-- 047 would unhide only those 149 and leave Fox 40 (1889938) and ~13k Sep 6
-- /sale SKUs hidden. Use the latest completed job that is at least half of the
-- store's 14-day max listings_upserted (same thin-scrape guard as the scheduler).
--
-- Then re-apply Jenson 025 and Universal Cycles 026 parent-hide predicates so
-- unhiding does not revive superseded parent SKUs next to variant rows.
--
-- Safe to re-run: only unhides rows matching the latest-full-scrape window, then
-- re-hides parents that still have longer/attribute siblings.

WITH recent AS (
  SELECT
    store_id,
    started_at,
    listings_upserted,
    MAX(listings_upserted) OVER (PARTITION BY store_id) AS max_upserted
  FROM scrape_jobs
  WHERE status = 'completed'
    AND listings_upserted >= 10
    AND started_at > NOW() - INTERVAL '14 days'
),
latest_full_scrape AS (
  SELECT DISTINCT ON (store_id)
    store_id,
    started_at
  FROM recent
  WHERE listings_upserted >= GREATEST(10, (max_upserted / 2))
  ORDER BY store_id, started_at DESC
)
UPDATE store_listings sl
SET hidden = false
FROM latest_full_scrape ls
WHERE sl.store_id = ls.store_id
  AND sl.hidden = true
  AND sl.last_scraped >= ls.started_at;

-- Re-hide JensonUSA parent dto.code rows (migration 025).
UPDATE store_listings sl
SET hidden = true
FROM stores s
WHERE sl.store_id = s.id
  AND s.store_type = 'jensonusa'
  AND sl.hidden = false
  AND EXISTS (
    SELECT 1
    FROM store_listings sl2
    WHERE sl2.store_id = sl.store_id
      AND sl2.product_url = sl.product_url
      AND sl2.hidden = false
      AND sl2.store_sku <> sl.store_sku
      AND starts_with(sl2.store_sku, sl.store_sku)
      AND char_length(sl2.store_sku) > char_length(sl.store_sku)
  );

-- Re-hide Universal Cycles parent product-id rows (migration 026).
UPDATE store_listings sl
SET hidden = true
FROM stores s
WHERE sl.store_id = s.id
  AND s.store_type = 'universalcycles'
  AND sl.hidden = false
  AND sl.store_sku NOT LIKE '%-%'
  AND EXISTS (
    SELECT 1
    FROM store_listings sl2
    WHERE sl2.store_id = sl.store_id
      AND sl2.product_url = sl.product_url
      AND sl2.hidden = false
      AND sl2.store_sku LIKE sl.store_sku || '-%'
  );
