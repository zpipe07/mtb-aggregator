-- Variant grouping: one row per variant, group at query time for deduplicated UI.
ALTER TABLE store_listings
  ADD COLUMN IF NOT EXISTS product_group_key TEXT,
  ADD COLUMN IF NOT EXISTS variant_options JSONB;

CREATE INDEX IF NOT EXISTS idx_store_listings_product_group_key
  ON store_listings (product_group_key)
  WHERE product_group_key IS NOT NULL;

-- Backfill product_group_key for Shopify stores from product URL handle.
UPDATE store_listings sl
SET product_group_key = sl.store_id::text || ':' || substring(sl.product_url FROM '/products/([^/?]+)')
FROM stores s
WHERE sl.store_id = s.id
  AND s.store_type IN ('ridebicycles', 'worldwidecyclery', 'revelbikes')
  AND (sl.product_group_key IS NULL OR sl.product_group_key = '')
  AND sl.product_url ~ '/products/[^/?]+';
