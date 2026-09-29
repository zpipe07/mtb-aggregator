-- ZAC-294: group existing Competitive Cyclist catalog rows that share a PDP URL.
-- Impact ingest now sets the same slug group key plus Size/Color on every scrape
-- (apps/api/internal/impact/cc_variants.go). This backfill collapses cards that
-- were stored flat before that path existed. Size comes from the title after the
-- last comma; Color is filled on the next CC scrape when siblings differ.

UPDATE store_listings l
SET product_group_key = s.id::text || ':' || regexp_replace(
    split_part(split_part(btrim(l.product_url), '?', 1), '#', 1),
    '^.*/',
    ''
)
FROM stores s
WHERE l.store_id = s.id
  AND s.store_type = 'competitivecyclist'
  AND l.product_url IS NOT NULL
  AND btrim(l.product_url) <> ''
  AND (l.product_group_key IS NULL OR btrim(l.product_group_key) = '');

UPDATE store_listings l
SET variant_options = COALESCE(l.variant_options, '{}'::jsonb) || jsonb_build_object(
    'Size',
    btrim(regexp_replace(l.product_name, '^.*,', ''))
)
FROM stores s
WHERE l.store_id = s.id
  AND s.store_type = 'competitivecyclist'
  AND l.product_name ~ '^[^,]+,[^,]+$'
  AND lower(btrim(regexp_replace(l.product_name, '^.*,', ''))) !~ '^(front|rear|left|right)$'
  AND (l.variant_options IS NULL OR NOT (l.variant_options ? 'Size'));

UPDATE store_listings l
SET variant_options = COALESCE(l.variant_options, '{}'::jsonb) || jsonb_build_object(
    'Position',
    btrim(regexp_replace(l.product_name, '^.*,', ''))
)
FROM stores s
WHERE l.store_id = s.id
  AND s.store_type = 'competitivecyclist'
  AND l.product_name ~ '^[^,]+,[^,]+$'
  AND lower(btrim(regexp_replace(l.product_name, '^.*,', ''))) ~ '^(front|rear|left|right)$'
  AND (l.variant_options IS NULL OR NOT (l.variant_options ? 'Position'));
