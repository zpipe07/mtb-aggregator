-- ZAC-217: Unhide listings confirmed by each store's latest completed scrape.
-- Scrape upsert used to refresh last_scraped without setting hidden=false, so
-- stale-cleanup hides stuck forever even after the SKU returned on /sale.
--
-- Uses scrape_jobs.started_at (not completed_at): last_scraped is stamped during
-- ingest, which finishes before the job row is marked completed.
-- Floor listings_upserted >= 10 matches minResultsForStaleCleanup.
--
-- Then re-apply Jenson 025 and Universal Cycles 026 parent-hide predicates so
-- unhiding does not revive superseded parent SKUs next to variant rows.
--
-- Safe to re-run: only unhides rows matching the latest-scrape window, then
-- re-hides parents that still have longer/attribute siblings.

WITH latest_scrape AS (
  SELECT DISTINCT ON (store_id)
    store_id,
    started_at
  FROM scrape_jobs
  WHERE status = 'completed'
    AND listings_upserted >= 10
  ORDER BY store_id, started_at DESC
)
UPDATE store_listings sl
SET hidden = false
FROM latest_scrape ls
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
