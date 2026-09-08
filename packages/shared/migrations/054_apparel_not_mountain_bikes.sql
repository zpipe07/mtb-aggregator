-- ZAC-264: Competitive Cyclist (and similar) apparel store paths contain
-- "mountain bike" / "road bike" / "bike" — e.g. "Women's Mountain Bike Bottoms",
-- "Men's Road Bike Tops". taxonomy.Map matches the rightmost segment first;
-- unmapped leaves ("Women's Skirts", "Men's Liners") fall back to that parent
-- and substring-match generic bike keywords. Same class of bug as bare light
-- (ZAC-234), wheelset vs bike (ZAC-245), and helmet parts (ZAC-246).
--
-- High-priority apparel phrases beat generic bike mappings. A path/name
-- backfill moves existing Bikes-tree apparel (skips manual override and
-- confident llm_category). Restart the API after apply so in-memory
-- mappings reload.

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
       'mountain bike clothing',
       'mtb clothing',
       'bike clothing',
       'mountain bike bottoms',
       'mtb bottoms',
       'bike bottoms',
       'mountain bike tops',
       'mtb tops',
       'bike tops',
       'road bike clothing',
       'road bike tops',
       'road bike bottoms',
       'triathlon clothing'
     ]::text[],
       ARRAY['Gear', 'Clothing']::text[],
       2010,
       (SELECT id FROM categories WHERE slug = 'gear-clothing' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE 'mountain bike clothing' = ANY (raw_keywords)
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
       'skirt',
       'skirts',
       'skort',
       'skorts',
       'skinsuit',
       'skinsuits',
       'cycling tops',
       'casual cycling',
       'tri tops',
       'tri top',
       'cycling hat',
       'cycling hats',
       'bike hat',
       'bike hats',
       'cycling cap',
       'cycling caps'
     ]::text[],
       ARRAY['Gear', 'Clothing']::text[],
       2010,
       (SELECT id FROM categories WHERE slug = 'gear-clothing' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE 'skirt' = ANY (raw_keywords)
      AND canonical = ARRAY['Gear', 'Clothing']::text[]
  );

UPDATE category_mappings
SET
  raw_keywords = (
    SELECT ARRAY(
      SELECT DISTINCT k
      FROM unnest(raw_keywords || ARRAY['liner short', 'men''s liners', 'women''s liners']::text[]) AS k
    )
  ),
  updated_at = NOW()
WHERE (
    canonical = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
    OR category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-shorts' LIMIT 1)
  )
  AND (
    NOT ('liner short' = ANY (raw_keywords))
    OR NOT ('men''s liners' = ANY (raw_keywords))
    OR NOT ('women''s liners' = ANY (raw_keywords))
  );

DO $$
DECLARE
  clothing_id INT;
  shorts_id INT;
  shirts_id INT;
  jerseys_id INT;
  jackets_id INT;
BEGIN
  SELECT id INTO clothing_id FROM categories WHERE slug = 'gear-clothing' LIMIT 1;
  SELECT id INTO shorts_id FROM categories WHERE slug = 'gear-clothing-shorts' LIMIT 1;
  SELECT id INTO shirts_id FROM categories WHERE slug = 'gear-clothing-shirts' LIMIT 1;
  SELECT id INTO jerseys_id FROM categories WHERE slug = 'gear-clothing-jerseys' LIMIT 1;
  SELECT id INTO jackets_id FROM categories WHERE slug = 'gear-clothing-jackets' LIMIT 1;

  IF clothing_id IS NULL THEN
    RAISE NOTICE '054: missing gear-clothing — skip apparel backfill';
    RETURN;
  END IF;

  -- Move Bikes-tree listings whose store path is clearly apparel.
  UPDATE store_listings sl
  SET
    category_id = clothing_id,
    canonical_category = ARRAY['Gear', 'Clothing']::text[]
  WHERE sl.category_id IN (SELECT id FROM categories WHERE slug LIKE 'bikes%')
    AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
    AND NOT (
      sl.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
      AND (sl.metadata->'llm_category'->>'confidence')::float >= 0.5
    )
    AND EXISTS (
      SELECT 1 FROM unnest(COALESCE(sl.category_path, '{}')) AS p
      WHERE p ILIKE '%clothing%'
         OR p ILIKE '%skirt%'
         OR p ILIKE '%skinsuit%'
         OR p ILIKE '%liners%'
         OR p ILIKE '%cycling tops%'
         OR p ILIKE '%casual cycling%'
         OR p ILIKE '%bike hats%'
         OR p ILIKE '%cycling hat%'
         OR p ILIKE '%tri tops%'
         OR p ILIKE '%triathlon%'
         OR p ILIKE '%bike bottoms%'
         OR p ILIKE '%bike tops%'
    );

  IF shorts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = shorts_id,
      canonical_category = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
    WHERE sl.category_id = clothing_id
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%short%'
        OR sl.product_name ILIKE '%liner%'
        OR sl.product_name ILIKE '%chamois%'
        OR sl.product_name ILIKE '%cham %'
      )
      AND sl.product_name NOT ILIKE '%helmet liner%';
  END IF;

  IF jerseys_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = jerseys_id,
      canonical_category = ARRAY['Gear', 'Clothing', 'Jerseys']::text[]
    WHERE sl.category_id = clothing_id
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND sl.product_name ILIKE '%jersey%';
  END IF;

  IF jackets_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = jackets_id,
      canonical_category = ARRAY['Gear', 'Clothing', 'Jackets']::text[]
    WHERE sl.category_id = clothing_id
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%jacket%'
        OR sl.product_name ILIKE '%windbreaker%'
        OR sl.product_name ILIKE '%softshell%'
        OR sl.product_name ILIKE '%gilet%'
      )
      AND sl.product_name NOT ILIKE '%jersey%';
  END IF;

  IF shirts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = shirts_id,
      canonical_category = ARRAY['Gear', 'Clothing', 'Shirts']::text[]
    WHERE sl.category_id = clothing_id
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%t-shirt%'
        OR sl.product_name ILIKE '%tee %'
        OR sl.product_name ILIKE '%hoodie%'
        OR sl.product_name ILIKE '%sweatshirt%'
      )
      AND sl.product_name NOT ILIKE '%jersey%'
      AND sl.product_name NOT ILIKE '%jacket%';
  END IF;
END $$;
