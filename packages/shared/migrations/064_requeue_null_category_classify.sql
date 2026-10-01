-- ZAC-298: in-stock listings were left with category_id NULL after classify
-- stamped classified_at. A quota halt returned success for the rest of the
-- job, and an unresolved canonical path was written with a null id.
-- Idempotent. Pair with the classify completion rules in the API.

-- 1. Canonical text that already names a tree node should have that id.
UPDATE store_listings AS l
SET category_id = ct.id
FROM (
  WITH RECURSIVE cat_tree(id, path) AS (
    SELECT id, (ARRAY[name])::text[] FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, (ct.path || c.name)::text[]
    FROM categories c
    JOIN cat_tree ct ON c.parent_id = ct.id
  )
  SELECT id, path FROM cat_tree
) AS ct
WHERE l.category_id IS NULL
  AND l.hidden = false
  AND l.is_in_stock = true
  AND l.canonical_category IS NOT NULL
  AND cardinality(l.canonical_category) > 0
  AND l.canonical_category = ct.path
  AND COALESCE((l.metadata->>'manual_category_override')::boolean, false) = false;

-- 2. Copy a category from an unambiguous non-hidden sibling (same store and
--    product group). Disagreeing sibling categories are left alone.
UPDATE store_listings AS l
SET
  category_id = picked.category_id,
  canonical_category = picked.canonical_category
FROM (
  SELECT DISTINCT ON (l0.id)
    l0.id AS listing_id,
    sib.category_id,
    sib.canonical_category
  FROM store_listings l0
  JOIN store_listings sib
    ON sib.store_id = l0.store_id
   AND sib.product_group_key = l0.product_group_key
   AND sib.id <> l0.id
   AND sib.hidden = false
   AND sib.category_id IS NOT NULL
  WHERE l0.category_id IS NULL
    AND l0.hidden = false
    AND l0.is_in_stock = true
    AND l0.product_group_key IS NOT NULL
    AND btrim(l0.product_group_key) <> ''
    AND COALESCE((l0.metadata->>'manual_category_override')::boolean, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM store_listings other
      WHERE other.store_id = l0.store_id
        AND other.product_group_key = l0.product_group_key
        AND other.hidden = false
        AND other.category_id IS NOT NULL
        AND other.category_id <> sib.category_id
    )
  ORDER BY l0.id, sib.id
) AS picked
WHERE l.id = picked.listing_id;

-- 3. Drop classify completion that recorded no category and no llm_category,
--    so the next llm_specs job can classify. Also clear a false extract stamp
--    when no specs were stored.
UPDATE listing_enrichment AS le
SET
  classified_at = NULL,
  classify_attempts = 0,
  classify_error = NULL,
  next_classify_attempt_at = NULL,
  classify_dead = false,
  llm_confidence = NULL,
  extracted_at = CASE
    WHEN l.metadata->'llm_specs' IS NULL
      OR l.metadata->'llm_specs' = 'null'::jsonb
      OR l.metadata->'llm_specs' = '{}'::jsonb
    THEN NULL
    ELSE le.extracted_at
  END,
  updated_at = NOW()
FROM store_listings AS l
WHERE le.listing_id = l.id
  AND l.hidden = false
  AND l.is_in_stock = true
  AND l.category_id IS NULL
  AND COALESCE((l.metadata->>'manual_category_override')::boolean, false) = false
  AND (
    l.metadata->'llm_category' IS NULL
    OR l.metadata->'llm_category' = 'null'::jsonb
  )
  AND le.classified_at IS NOT NULL;

-- 4. Quota dead-letters were a provider outage, not a bad listing.
UPDATE listing_enrichment
SET
  classify_dead = false,
  classify_attempts = 0,
  next_classify_attempt_at = NULL,
  classify_error = NULL,
  updated_at = NOW()
WHERE classify_dead = true
  AND classify_error IS NOT NULL
  AND (
    classify_error ILIKE '%quota%'
    OR classify_error ILIKE '%insufficient_quota%'
    OR classify_error ILIKE '%credit_balance%'
  );

UPDATE listing_enrichment
SET
  extract_dead = false,
  extract_attempts = 0,
  next_extract_attempt_at = NULL,
  extract_error = NULL,
  updated_at = NOW()
WHERE extract_dead = true
  AND extract_error IS NOT NULL
  AND (
    extract_error ILIKE '%quota%'
    OR extract_error ILIKE '%insufficient_quota%'
    OR extract_error ILIKE '%credit_balance%'
  );
