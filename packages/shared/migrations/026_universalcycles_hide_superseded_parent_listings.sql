-- After Universal Cycles enrich fans out attribute rows (store_sku = '{productId}-{attributeId}'),
-- hide legacy parent rows keyed by product id only (store_sku with no hyphen).
--
-- Safe to re-run: only sets hidden=true when attribute SKU siblings exist on the same store + URL.

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
