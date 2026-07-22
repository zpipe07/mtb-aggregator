-- Gear: Eyewear parent + Sunglasses / Goggles children; high-priority mappings; product-name backfill.
-- Idempotent: only inserts when target slugs are missing.

DO $$
DECLARE
  gear_id INT;
  eyewear_id INT;
  sunglasses_id INT;
  goggles_id INT;
BEGIN
  SELECT id INTO gear_id FROM categories WHERE slug = 'gear' LIMIT 1;
  IF gear_id IS NULL THEN
    RAISE NOTICE '027: no categories.gear row — skip eyewear inserts';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-eyewear') THEN
    UPDATE categories SET sort_order = sort_order + 1
    WHERE parent_id = gear_id AND sort_order >= 2;

    INSERT INTO categories (slug, name, parent_id, sort_order, depth)
    VALUES ('gear-eyewear', 'Eyewear', gear_id, 2, 1);
  END IF;

  SELECT id INTO eyewear_id FROM categories WHERE slug = 'gear-eyewear' LIMIT 1;

  IF eyewear_id IS NOT NULL THEN
    INSERT INTO categories (slug, name, parent_id, sort_order, depth) VALUES
      ('gear-eyewear-sunglasses', 'Sunglasses', eyewear_id, 1, 2),
      ('gear-eyewear-goggles', 'Goggles', eyewear_id, 2, 2)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  SELECT id INTO sunglasses_id FROM categories WHERE slug = 'gear-eyewear-sunglasses' LIMIT 1;
  SELECT id INTO goggles_id FROM categories WHERE slug = 'gear-eyewear-goggles' LIMIT 1;

  -- Goggles: product-name backfill for misfiled / uncategorized listings
  IF goggles_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = goggles_id,
      canonical_category = ARRAY['Gear', 'Eyewear', 'Goggles']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ILIKE '%goggle%'
        OR sl.product_name ILIKE '%goggles%'
      )
      AND sl.product_name NOT ILIKE '%google%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'gear', 'gear-clothing', 'gear-protection', 'accessories',
            'gear-clothing-tops', 'gear-clothing-bottoms'
          )
        )
        OR sl.category_id = sunglasses_id
      );
  END IF;

  -- Sunglasses: after goggle pass so goggle titles are not misclassified
  IF sunglasses_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = sunglasses_id,
      canonical_category = ARRAY['Gear', 'Eyewear', 'Sunglasses']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ILIKE '%sunglass%'
        OR sl.product_name ILIKE '%sunglasses%'
        OR sl.product_name ILIKE '%eyewear%'
        OR sl.product_name ~* '\mglasses\M'
      )
      AND sl.product_name NOT ILIKE '%goggle%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'gear', 'gear-clothing', 'gear-protection', 'accessories',
            'gear-clothing-tops', 'gear-clothing-bottoms'
          )
        )
      );
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before legacy ~1000 priority seeds). First match wins.
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['goggle', 'goggles', 'mtb goggle', 'bike goggle', 'bike goggles', 'mtb goggles']::text[],
       ARRAY['Gear', 'Eyewear', 'Goggles']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-eyewear-goggles' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-eyewear-goggles')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Eyewear', 'Goggles']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['sunglass', 'sunglasses', 'cycling glasses', 'bike glasses', 'riding glasses']::text[],
       ARRAY['Gear', 'Eyewear', 'Sunglasses']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-eyewear-sunglasses' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-eyewear-sunglasses')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Gear', 'Eyewear', 'Sunglasses']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['eyewear', 'cycling eyewear', 'bike eyewear']::text[],
       ARRAY['Gear', 'Eyewear']::text[],
       1985,
       (SELECT id FROM categories WHERE slug = 'gear-eyewear' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-eyewear')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1985 AND canonical = ARRAY['Gear', 'Eyewear']::text[]
  );
