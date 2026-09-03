-- Gear: Helmet parts sibling of Helmets (ZAC-246).
-- Cheap replacement pads, visors, and liners currently land on Helmets because
-- store paths like "Helmet Parts" / "Helmet Accessories" substring-match bare
-- "helmet". A sibling leaf (not a Helmets child) keeps them off
-- /deals?category_slug=gear-helmets (subtree filter).
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  gear_id INT;
  parts_id INT;
BEGIN
  SELECT id INTO gear_id FROM categories WHERE slug = 'gear' LIMIT 1;

  IF gear_id IS NULL THEN
    RAISE NOTICE '052: missing categories.gear — skip helmet-parts insert';
    RETURN;
  END IF;

  -- Sit immediately after Helmets (sort_order 0). Only shift siblings on first insert.
  IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-helmet-parts') THEN
    UPDATE categories SET sort_order = sort_order + 1
    WHERE parent_id = gear_id AND sort_order >= 1;
  END IF;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'gear-helmet-parts',
    'Helmet parts',
    gear_id,
    1,
    1,
    'Replacement helmet parts and accessories sold without a helmet: visors/peaks, cheek pads, comfort/inner liners, pad kits, fit systems, retention systems, chin bars sold alone, screw kits, and helmet covers. Does NOT include complete helmets (use Helmets), helmet-mounted lights (use Accessories > Lights), or body armor / knee pads (use Protection).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  SELECT id INTO parts_id FROM categories WHERE slug = 'gear-helmet-parts' LIMIT 1;

  UPDATE categories SET description = 'Complete bike helmets only — half-shell XC/trail/road, 3/4 shell, full-face MTB, and convertible dual-function helmets. Does NOT include replacement visors, liners, cheek pads, pad kits, fit systems, or chin bars sold alone (use Helmet parts).'
  WHERE slug = 'gear-helmets';

  UPDATE categories SET description = 'Rider-worn protective equipment and apparel: helmets, helmet parts, shoes, clothing, body armor, and gloves. NOT bike components (use Components). NOT tools or bags (use Accessories).'
  WHERE slug = 'gear';

  UPDATE categories SET description = 'Body armor and protective padding: knee pads, elbow pads, shin guards, hip pads, back protectors, chest protectors, and neck braces. NOT helmets (use Helmets). NOT helmet pad kits or cheek pads sold as helmet replacements (use Helmet parts). NOT gloves (use Gloves).'
  WHERE slug = 'gear-protection';

  -- Product-name backfill from Helmets (and nearby misfiles). Path-only remap
  -- cannot move "Tactic Visor" under a "Mountain Bike Helmets" breadcrumb.
  IF parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = parts_id,
      canonical_category = ARRAY['Gear', 'Helmet parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ILIKE '%helmet visor%'
        OR sl.product_name ILIKE '%helmet liner%'
        OR sl.product_name ILIKE '%helmet pad%'
        OR sl.product_name ILIKE '%helmet peak%'
        OR sl.product_name ILIKE '%helmet cover%'
        OR sl.product_name ILIKE '%helmet screw%'
        OR sl.product_name ILIKE '%replacement visor%'
        OR sl.product_name ILIKE '%replacement liner%'
        OR sl.product_name ILIKE '%replacement pad%'
        OR sl.product_name ILIKE '%replacement retention%'
        OR sl.product_name ILIKE '%pad set%'
        OR sl.product_name ILIKE '%pad kit%'
        OR sl.product_name ILIKE '%cheek pad%'
        OR sl.product_name ILIKE '%cheekpad%'
        OR sl.product_name ILIKE '%crown pad%'
        OR sl.product_name ILIKE '%comfort liner%'
        OR sl.product_name ILIKE '%inner liner%'
        OR sl.product_name ILIKE '%fit kit%'
        OR sl.product_name ILIKE '%fit system%'
        OR sl.product_name ILIKE '%neckroll%'
        OR sl.product_name ILIKE '%neck roll%'
        OR sl.product_name ILIKE '%retention system%'
        OR (
          sl.product_name ~* '\mvisor\M'
          AND sl.product_name NOT ILIKE '%with visor%'
          AND sl.product_name NOT ILIKE '%with removable visor%'
        )
      )
      AND sl.product_name NOT ILIKE '%with visor%'
      AND sl.product_name NOT ILIKE '%with removable visor%'
      AND sl.product_name NOT ILIKE '%helmet light%'
      AND sl.product_name NOT ILIKE '%helmet mount%'
      AND sl.product_name NOT ILIKE '%liner short%'
      AND sl.product_name NOT ILIKE '%shorts liner%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'gear-helmets',
            'gear',
            'accessories',
            'accessories-bags'
          )
        )
      );
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before the legacy helmet/helmets seed).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'helmet parts', 'helmet part', 'helmet accessories', 'helmet accessory',
  'helmet visor', 'helmet visors', 'helmet liner', 'helmet liners',
  'helmet pad', 'helmet pads', 'helmet padding',
  'replacement visor', 'replacement visors', 'replacement liner', 'replacement liners',
  'cheek pad', 'cheek pads', 'cheekpad', 'cheekpads'
]::text[],
       ARRAY['Gear', 'Helmet parts']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'gear-helmet-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-helmet-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990
      AND canonical = ARRAY['Gear', 'Helmet parts']::text[]
  );
