-- ZAC-278 / ZAC-281: drop Shopify Title / Default Title and schema.org leftovers
-- from stored variant_options. Scrape now omits these, but upsert merge (ZAC-276)
-- kept existing placeholder keys when the incoming scrape sent null/{}.
-- Safe to re-run: only rewrites rows whose cleaned object differs.

UPDATE store_listings sl
SET variant_options = cleaned.opts
FROM (
  SELECT
    src.id,
    CASE
      WHEN kept.opts IS NULL OR kept.opts = '{}'::jsonb THEN NULL
      ELSE kept.opts
    END AS opts
  FROM store_listings src
  CROSS JOIN LATERAL (
    SELECT jsonb_object_agg(e.key, e.value) AS opts
    FROM jsonb_each(src.variant_options) e
    WHERE jsonb_typeof(src.variant_options) = 'object'
      AND NOT (
        lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) IN ('', 'title', 'schema stock status')
        OR btrim(COALESCE(e.value #>> '{}', '')) = ''
        OR lower(regexp_replace(btrim(COALESCE(e.value #>> '{}', '')), '\s+', ' ', 'g')) = 'default title'
        OR lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) LIKE 'schema %'
        OR regexp_replace(lower(e.key), '[\s_-]+', '', 'g') LIKE 'schema%'
        OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'http://schema.org/%'
        OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'https://schema.org/%'
      )
  ) kept
  WHERE src.variant_options IS NOT NULL
    AND src.variant_options <> '{}'::jsonb
    AND src.variant_options <> 'null'::jsonb
    AND jsonb_typeof(src.variant_options) = 'object'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(src.variant_options) e
      WHERE
        lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) IN ('', 'title', 'schema stock status')
        OR btrim(COALESCE(e.value #>> '{}', '')) = ''
        OR lower(regexp_replace(btrim(COALESCE(e.value #>> '{}', '')), '\s+', ' ', 'g')) = 'default title'
        OR lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) LIKE 'schema %'
        OR regexp_replace(lower(e.key), '[\s_-]+', '', 'g') LIKE 'schema%'
        OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'http://schema.org/%'
        OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'https://schema.org/%'
    )
) cleaned
WHERE sl.id = cleaned.id
  AND sl.variant_options IS DISTINCT FROM cleaned.opts;
