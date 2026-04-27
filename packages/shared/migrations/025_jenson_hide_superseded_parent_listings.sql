-- After JensonUSA scrape emits one row per variants[].code, legacy rows keyed by
-- parent dto.code share the same product_url but a shorter store_sku. Hide those
-- parents so they do not duplicate grouped variant rows in the UI.
--
-- Safe to re-run: only sets hidden=true where a strictly longer variant SKU exists
-- on the same store + URL (starts_with + length).

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
