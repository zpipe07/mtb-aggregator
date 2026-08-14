-- Gear > Clothing: flatten Tops/Bottoms — Jerseys, Jackets, Shirts, Shorts, Pants, Socks directly under Clothing.
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  clothing_id INT;
  tops_id INT;
  bottoms_id INT;
  jerseys_id INT;
  jackets_id INT;
  shirts_id INT;
  shorts_id INT;
  pants_id INT;
  socks_id INT;
BEGIN
  SELECT id INTO clothing_id FROM categories WHERE slug = 'gear-clothing' LIMIT 1;
  IF clothing_id IS NULL THEN
    RAISE NOTICE '037: missing gear-clothing — skip flatten';
    RETURN;
  END IF;

  SELECT id INTO tops_id FROM categories WHERE slug = 'gear-clothing-tops' LIMIT 1;
  SELECT id INTO bottoms_id FROM categories WHERE slug = 'gear-clothing-bottoms' LIMIT 1;

  -- Reparent + rename leaves under Clothing (depth 2).
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 0, slug = 'gear-clothing-jerseys'
  WHERE slug = 'gear-clothing-tops-jerseys';
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 1, slug = 'gear-clothing-jackets'
  WHERE slug = 'gear-clothing-tops-jackets';
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 2, slug = 'gear-clothing-shirts'
  WHERE slug = 'gear-clothing-tops-shirts';
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 3, slug = 'gear-clothing-shorts'
  WHERE slug = 'gear-clothing-bottoms-shorts';
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 4, slug = 'gear-clothing-pants'
  WHERE slug = 'gear-clothing-bottoms-pants';
  UPDATE categories SET parent_id = clothing_id, depth = 2, sort_order = 5
  WHERE slug = 'gear-clothing-socks';

  SELECT id INTO jerseys_id FROM categories WHERE slug = 'gear-clothing-jerseys' LIMIT 1;
  SELECT id INTO jackets_id FROM categories WHERE slug = 'gear-clothing-jackets' LIMIT 1;
  SELECT id INTO shirts_id FROM categories WHERE slug = 'gear-clothing-shirts' LIMIT 1;
  SELECT id INTO shorts_id FROM categories WHERE slug = 'gear-clothing-shorts' LIMIT 1;
  SELECT id INTO pants_id FROM categories WHERE slug = 'gear-clothing-pants' LIMIT 1;
  SELECT id INTO socks_id FROM categories WHERE slug = 'gear-clothing-socks' LIMIT 1;

  -- Rewrite canonical paths on listings already on renamed leaves.
  IF jerseys_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Jerseys']::text[]
    WHERE category_id = jerseys_id;
  END IF;
  IF jackets_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Jackets']::text[]
    WHERE category_id = jackets_id;
  END IF;
  IF shirts_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Shirts']::text[]
    WHERE category_id = shirts_id;
  END IF;
  IF shorts_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
    WHERE category_id = shorts_id;
  END IF;
  IF pants_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Pants']::text[]
    WHERE category_id = pants_id;
  END IF;
  IF socks_id IS NOT NULL THEN
    UPDATE store_listings
    SET canonical_category = ARRAY['Gear', 'Clothing', 'Socks']::text[]
    WHERE category_id = socks_id;
  END IF;

  -- Product-name backfill from Clothing / Tops / Bottoms buckets only (most-specific first).
  IF jerseys_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = jerseys_id, canonical_category = ARRAY['Gear', 'Clothing', 'Jerseys']::text[]
    WHERE sl.product_name ILIKE '%jersey%'
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  IF jackets_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = jackets_id, canonical_category = ARRAY['Gear', 'Clothing', 'Jackets']::text[]
    WHERE (
        sl.product_name ILIKE '%jacket%'
        OR sl.product_name ILIKE '%windbreaker%'
        OR sl.product_name ILIKE '%softshell%'
        OR (sl.product_name ILIKE '%vest%' AND sl.product_name NOT ILIKE '%investment%')
        OR sl.product_name ILIKE '%gilet%'
      )
      AND sl.product_name NOT ILIKE '%jersey%'
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  IF shorts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = shorts_id, canonical_category = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
    WHERE (
        sl.product_name ILIKE '%shorts%'
        OR sl.product_name ILIKE '%bib short%'
      )
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  IF pants_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = pants_id, canonical_category = ARRAY['Gear', 'Clothing', 'Pants']::text[]
    WHERE (
        sl.product_name ILIKE '%pants%'
        OR sl.product_name ILIKE '%bib tights%'
        OR sl.product_name ILIKE '%cycling tights%'
      )
      AND sl.product_name NOT ILIKE '%short%'
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  IF socks_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = socks_id, canonical_category = ARRAY['Gear', 'Clothing', 'Socks']::text[]
    WHERE sl.product_name ILIKE '%socks%'
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  IF shirts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET category_id = shirts_id, canonical_category = ARRAY['Gear', 'Clothing', 'Shirts']::text[]
    WHERE (
        sl.product_name ILIKE '%hoodie%'
        OR sl.product_name ILIKE '%sweatshirt%'
        OR sl.product_name ILIKE '%t-shirt%'
        OR sl.product_name ILIKE '%flannel%'
        OR sl.product_name ILIKE '%base layer%'
        OR sl.product_name ~* '\mshirt\M'
      )
      AND sl.product_name NOT ILIKE '%jersey%'
      AND sl.product_name NOT ILIKE '%jacket%'
      AND (
        sl.category_id IN (SELECT id FROM categories WHERE slug IN ('gear-clothing', 'gear-clothing-tops', 'gear-clothing-bottoms'))
        OR sl.category_id = clothing_id
        OR (tops_id IS NOT NULL AND sl.category_id = tops_id)
        OR (bottoms_id IS NOT NULL AND sl.category_id = bottoms_id)
      );
  END IF;

  -- Remainder on Tops/Bottoms → Clothing parent (required before delete).
  IF tops_id IS NOT NULL THEN
    UPDATE store_listings
    SET category_id = clothing_id, canonical_category = ARRAY['Gear', 'Clothing']::text[]
    WHERE category_id = tops_id;
  END IF;
  IF bottoms_id IS NOT NULL THEN
    UPDATE store_listings
    SET category_id = clothing_id, canonical_category = ARRAY['Gear', 'Clothing']::text[]
    WHERE category_id = bottoms_id;
  END IF;

  -- LLM prompt profiles: flatten paths; remove Tops/Bottoms parent profiles.
  UPDATE llm_prompt_profiles
  SET canonical_category = ARRAY['Gear', 'Clothing', 'Jerseys']::text[]
  WHERE category_id = jerseys_id AND jerseys_id IS NOT NULL;

  UPDATE llm_prompt_profiles
  SET canonical_category = ARRAY['Gear', 'Clothing', 'Shirts']::text[]
  WHERE category_id = shirts_id AND shirts_id IS NOT NULL;

  UPDATE llm_prompt_profiles
  SET canonical_category = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
  WHERE category_id = shorts_id AND shorts_id IS NOT NULL;

  UPDATE llm_prompt_profiles
  SET canonical_category = ARRAY['Gear', 'Clothing', 'Pants']::text[]
  WHERE category_id = pants_id AND pants_id IS NOT NULL;

  DELETE FROM llm_prompt_profiles WHERE category_id IN (tops_id, bottoms_id);

  -- Classifier rubrics.
  UPDATE categories SET description = 'Bike-specific riding apparel. Use the most specific sub-category: Jerseys, Jackets, Shirts, Shorts, Pants, or Socks. NOT shoes (use Shoes), gloves (use Gloves), or helmets (use Helmets).'
  WHERE slug = 'gear-clothing';

  UPDATE categories SET description = 'Technical cycling jerseys (MTB, road, trail) — moisture-wicking, typically with back pockets. Does NOT include casual tees or base layers (use Shirts) or outerwear (use Jackets).'
  WHERE slug = 'gear-clothing-jerseys';

  UPDATE categories SET description = 'Outerwear for cycling: rain jackets, windbreakers, softshells, and insulated vests and jackets.'
  WHERE slug = 'gear-clothing-jackets';

  UPDATE categories SET description = 'Casual riding tees, base layers, flannels, and hoodies. Does NOT include technical jerseys (use Jerseys) or outerwear (use Jackets).'
  WHERE slug = 'gear-clothing-shirts';

  UPDATE categories SET description = 'Cycling shorts — bib shorts, baggy MTB shorts, liner shorts, and trail shorts.'
  WHERE slug = 'gear-clothing-shorts';

  UPDATE categories SET description = 'Full-length cycling pants and bib tights for cooler conditions.'
  WHERE slug = 'gear-clothing-pants';

  UPDATE categories SET description = 'Cycling-specific socks.'
  WHERE slug = 'gear-clothing-socks';

  -- Delete Tops/Bottoms category rows (children already reparented).
  DELETE FROM categories WHERE slug IN ('gear-clothing-tops', 'gear-clothing-bottoms');
END $$;

-- Remove sleeve → Tops mapping.
DELETE FROM category_mappings
WHERE canonical = ARRAY['Gear', 'Clothing', 'Tops']::text[];

-- High-priority leaf mappings (evaluated before legacy ~60 Clothing catch-all).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['jersey', 'jerseys', 'cycling jersey', 'mtb jersey', 'bike jersey']::text[],
       ARRAY['Gear', 'Clothing', 'Jerseys']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-jerseys' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-jerseys')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Jerseys']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['jacket', 'jackets', 'windbreaker', 'softshell', 'rain jacket', 'vest', 'vests', 'gilet']::text[],
       ARRAY['Gear', 'Clothing', 'Jackets']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-jackets' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-jackets')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Jackets']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['t-shirt', 't-shirts', 'hoodie', 'hoodies', 'sweatshirt', 'flannel', 'base layer', 'long sleeve']::text[],
       ARRAY['Gear', 'Clothing', 'Shirts']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-shirts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-shirts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Shirts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['shorts', 'bib shorts', 'cycling shorts', 'mtb shorts', 'liner shorts']::text[],
       ARRAY['Gear', 'Clothing', 'Shorts']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-shorts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-shorts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Shorts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['pants', 'cycling pants', 'bib tights', 'cycling tights']::text[],
       ARRAY['Gear', 'Clothing', 'Pants']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-pants' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-pants')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Pants']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['socks', 'cycling socks']::text[],
       ARRAY['Gear', 'Clothing', 'Socks']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-clothing-socks' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-clothing-socks')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Clothing', 'Socks']::text[]
  );

-- Rewrite any stale mapping rows that still point at old canonical paths.
UPDATE category_mappings cm
SET canonical = ARRAY['Gear', 'Clothing', 'Jerseys']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-jerseys' LIMIT 1)
WHERE cm.canonical = ARRAY['Gear', 'Clothing', 'Tops', 'Jerseys']::text[];

UPDATE category_mappings cm
SET canonical = ARRAY['Gear', 'Clothing', 'Jackets']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-jackets' LIMIT 1)
WHERE cm.canonical = ARRAY['Gear', 'Clothing', 'Tops', 'Jackets']::text[];

UPDATE category_mappings cm
SET canonical = ARRAY['Gear', 'Clothing', 'Shirts']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-shirts' LIMIT 1)
WHERE cm.canonical = ARRAY['Gear', 'Clothing', 'Tops', 'Shirts']::text[];

UPDATE category_mappings cm
SET canonical = ARRAY['Gear', 'Clothing', 'Shorts']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-shorts' LIMIT 1)
WHERE cm.canonical = ARRAY['Gear', 'Clothing', 'Bottoms', 'Shorts']::text[];

UPDATE category_mappings cm
SET canonical = ARRAY['Gear', 'Clothing', 'Pants']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing-pants' LIMIT 1)
WHERE cm.canonical = ARRAY['Gear', 'Clothing', 'Bottoms', 'Pants']::text[];
