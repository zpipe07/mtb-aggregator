-- Accessories: Pumps leaf; mappings, backfill, classifier rubrics.
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  accessories_id INT;
  pumps_id INT;
BEGIN
  SELECT id INTO accessories_id FROM categories WHERE slug = 'accessories' LIMIT 1;

  IF accessories_id IS NULL THEN
    RAISE NOTICE '038: missing accessories — skip shelf insert';
    RETURN;
  END IF;

  -- Make room at sort_order 1 (after Tools).
  UPDATE categories SET sort_order = 2
  WHERE slug = 'accessories-hydration' AND sort_order < 2;

  UPDATE categories SET sort_order = 3
  WHERE slug = 'accessories-bags' AND sort_order < 3;

  UPDATE categories SET sort_order = 4
  WHERE slug = 'accessories-lights' AND sort_order < 4;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'accessories-pumps',
    'Pumps',
    accessories_id,
    1,
    1,
    'Bike inflation: floor pumps, mini/hand pumps, frame pumps, shock/fork pumps, electric pumps, and CO2 inflators. Does NOT include pump parts, rebuild kits, pump heads/hoses, pump mounts, pump-track bikes, or general workshop tools (use Accessories > Tools).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  SELECT id INTO pumps_id FROM categories WHERE slug = 'accessories-pumps' LIMIT 1;

  UPDATE categories SET description = 'Non-apparel bike accessories and consumables: tools, pumps, bags, lights, and hydration gear. NOT bike components (use Components). NOT riding apparel or protection (use Gear).'
  WHERE slug = 'accessories';

  UPDATE categories SET description = 'Bike tools, multi-tools, repair kits, and workshop equipment. Includes tire levers, chain tools, and tubeless plug kits. Does NOT include floor pumps, mini pumps, shock pumps, or CO2 inflators (use Pumps).'
  WHERE slug = 'accessories-tools';

  -- Product-name backfill from misfiled buckets (exclude parts, mounts, bags, bikes).
  IF pumps_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = pumps_id,
      canonical_category = ARRAY['Accessories', 'Pumps']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ~* '\mpump\M'
        OR sl.product_name ILIKE '%inflator%'
      )
      AND sl.product_name NOT ILIKE '%pump track%'
      AND sl.product_name NOT ILIKE '%pumptrack%'
      AND sl.product_name NOT ILIKE '%pump-track%'
      AND sl.product_name NOT ILIKE '%pump saddle%'
      AND sl.product_name NOT ILIKE '%pump 100%'
      AND sl.product_name NOT ILIKE '%pump part%'
      AND sl.product_name NOT ILIKE '%pump head%'
      AND sl.product_name NOT ILIKE '%pump hose%'
      AND sl.product_name NOT ILIKE '%rebuild kit%'
      AND sl.product_name NOT ILIKE '%upgrade kit%'
      AND sl.product_name NOT ILIKE '%pump mount%'
      AND sl.product_name NOT ILIKE '%seat bag%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'accessories-tools',
            'accessories',
            'components-suspension',
            'components-suspension-shocks',
            'components-suspension-forks',
            'components',
            'components-drivetrain-cranks'
          )
        )
      );
  END IF;
END $$;

-- Remove pump from the broad Tools mapping (fresh seeds omit it; prod may still have it).
UPDATE category_mappings
SET raw_keywords = array_remove(raw_keywords, 'pump')
WHERE canonical = ARRAY['Accessories', 'Tools']::text[]
  AND 'pump' = ANY(raw_keywords);

-- High-priority taxonomy rows (evaluated before legacy Tools rule with bare pump).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'pumps', 'floor pump', 'floor pumps', 'shock pump', 'shock pumps',
  'mini pump', 'mini pumps', 'hand pump', 'hand pumps',
  'frame pump', 'frame pumps', 'framefit pump', 'framefit pumps',
  'electric pump', 'electric pumps', 'tire pump', 'tire pumps',
  'tyre pump', 'tyre pumps', 'bike pump', 'bike pumps',
  'track pump', 'track pumps', 'suspension pump', 'suspension pumps',
  'fork pump', 'fork pumps', 'inflator', 'inflators',
  'co2 inflator', 'co2 inflators'
]::text[],
       ARRAY['Accessories', 'Pumps']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'accessories-pumps' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'accessories-pumps')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990
      AND canonical = ARRAY['Accessories', 'Pumps']::text[]
  );
