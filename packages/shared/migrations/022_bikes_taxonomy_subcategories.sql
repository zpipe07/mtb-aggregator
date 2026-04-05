-- Bikes: add Electric Mountain Bikes (eMTB) sibling; add discipline subcategories under Mountain and power-type under eMTB.
-- Idempotent: only inserts when target slugs are missing.

DO $$
DECLARE
  bikes_id INT;
  mountain_id INT;
  emtb_id INT;
BEGIN
  SELECT id INTO bikes_id FROM categories WHERE slug = 'bikes' LIMIT 1;
  IF bikes_id IS NULL THEN
    RAISE NOTICE '022: no categories.bikes row — skip bikes taxonomy inserts';
    RETURN;
  END IF;

  -- Room for bikes-emtb at sort_order 2 (after Mountain)
  IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-emtb') THEN
    UPDATE categories SET sort_order = sort_order + 1
    WHERE parent_id = bikes_id AND sort_order >= 2;

    INSERT INTO categories (slug, name, parent_id, sort_order, depth)
    VALUES ('bikes-emtb', 'Electric Mountain Bikes', bikes_id, 2, 1);
  END IF;

  SELECT id INTO mountain_id FROM categories WHERE slug = 'bikes-mountain' LIMIT 1;
  SELECT id INTO emtb_id FROM categories WHERE slug = 'bikes-emtb' LIMIT 1;

  -- Mountain discipline children (depth 2)
  IF mountain_id IS NOT NULL THEN
    INSERT INTO categories (slug, name, parent_id, sort_order, depth) VALUES
      ('bikes-mountain-xc', 'XC', mountain_id, 1, 2),
      ('bikes-mountain-trail', 'Trail', mountain_id, 2, 2),
      ('bikes-mountain-enduro', 'Enduro', mountain_id, 3, 2),
      ('bikes-mountain-downhill', 'Downhill', mountain_id, 4, 2),
      ('bikes-mountain-dirt-jump', 'Dirt Jump', mountain_id, 5, 2),
      ('bikes-mountain-fat-bike', 'Fat Bike', mountain_id, 6, 2)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- eMTB power-type children (depth 2)
  IF emtb_id IS NOT NULL THEN
    INSERT INTO categories (slug, name, parent_id, sort_order, depth) VALUES
      ('bikes-emtb-full-power', 'Full Power', emtb_id, 1, 2),
      ('bikes-emtb-lightweight', 'Lightweight', emtb_id, 2, 2)
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before legacy ~1000 priority seeds). First match wins.
-- category_id resolved when path exists after category inserts above.
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['emtb', 'e-mtb', 'e mtb', 'e-mountain bike', 'electric mountain bike', 'electric mountain', 'e-mountain']::text[],
       ARRAY['Bikes', 'Electric Mountain Bikes']::text[],
       2000,
       (SELECT id FROM categories WHERE slug = 'bikes-emtb' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-emtb')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 2000 AND canonical = ARRAY['Bikes', 'Electric Mountain Bikes']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['xc racing', 'xc race', 'cross country mountain', 'xc mountain', 'xc bike', 'cross country bike']::text[],
       ARRAY['Bikes', 'Mountain', 'XC']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-xc' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-xc')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'XC']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['trail bike', 'trail mountain', 'trail riding']::text[],
       ARRAY['Bikes', 'Mountain', 'Trail']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-trail' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-trail')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'Trail']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['enduro bike', 'enduro mountain', 'enduro']::text[],
       ARRAY['Bikes', 'Mountain', 'Enduro']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-enduro' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-enduro')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'Enduro']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['downhill bike', 'dh bike', 'downhill mountain']::text[],
       ARRAY['Bikes', 'Mountain', 'Downhill']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-downhill' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-downhill')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'Downhill']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['dirt jump bike', 'dirt jumper', 'dj bike']::text[],
       ARRAY['Bikes', 'Mountain', 'Dirt Jump']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-dirt-jump' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-dirt-jump')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'Dirt Jump']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['fat bike', 'fatbike', 'fat tire bike']::text[],
       ARRAY['Bikes', 'Mountain', 'Fat Bike']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain-fat-bike' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain-fat-bike')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Mountain', 'Fat Bike']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['full power emtb', 'full power e-mtb', 'full-power ebike', 'full power electric mountain']::text[],
       ARRAY['Bikes', 'Electric Mountain Bikes', 'Full Power']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-emtb-full-power' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-emtb-full-power')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Electric Mountain Bikes', 'Full Power']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['lightweight emtb', 'light emtb', 'lightweight e-mtb', 'sl emtb']::text[],
       ARRAY['Bikes', 'Electric Mountain Bikes', 'Lightweight']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'bikes-emtb-lightweight' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-emtb-lightweight')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990 AND canonical = ARRAY['Bikes', 'Electric Mountain Bikes', 'Lightweight']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['electric road bike', 'electric gravel bike', 'electric commuter', 'electric city bike', 'hybrid e-bike']::text[],
       ARRAY['Bikes', 'Electric']::text[],
       1980,
       (SELECT id FROM categories WHERE slug = 'bikes-electric' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-electric')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE canonical = ARRAY['Bikes', 'Electric']::text[] AND priority = 1980
  );
