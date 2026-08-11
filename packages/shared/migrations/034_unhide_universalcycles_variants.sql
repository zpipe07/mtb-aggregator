-- ZAC-196: Unhide Universal Cycles listings incorrectly hidden by stale cleanup.
-- Variant rows created by PDP enrichment never got last_scraped refreshed on scrape,
-- so HideStaleListings hid them despite still being on sale.
-- Safe to re-run: only unhides rows matching the repair criteria.

-- Unhide UC variant rows whose parent was scraped within the last 2 days.
UPDATE store_listings child
SET hidden = false, last_scraped = NOW()
FROM store_listings parent
JOIN stores s ON parent.store_id = s.id
WHERE s.store_type = 'universalcycles'
  AND child.store_id = parent.store_id
  AND child.store_sku LIKE '%-%'
  AND parent.store_sku NOT LIKE '%-%'
  AND child.store_sku LIKE parent.store_sku || '-%'
  AND child.hidden = true
  AND parent.last_scraped >= NOW() - INTERVAL '2 days';

-- Unhide UC parent rows that have no variant siblings (never enriched).
UPDATE store_listings sl
SET hidden = false
FROM stores s
WHERE sl.store_id = s.id
  AND s.store_type = 'universalcycles'
  AND sl.hidden = true
  AND sl.store_sku NOT LIKE '%-%'
  AND NOT EXISTS (
    SELECT 1 FROM store_listings sl2
    WHERE sl2.store_id = sl.store_id
      AND sl2.store_sku LIKE sl.store_sku || '-%'
  );
