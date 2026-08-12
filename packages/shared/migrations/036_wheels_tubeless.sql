-- Components: Wheels/Tires > Tubeless; mappings, backfill, classifier rubrics.
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  wheels_tires_id INT;
  tubeless_id INT;
BEGIN
  SELECT id INTO wheels_tires_id FROM categories WHERE slug = 'components-wheels-tires' LIMIT 1;

  IF wheels_tires_id IS NULL THEN
    RAISE NOTICE '036: missing components-wheels-tires — skip shelf insert';
    RETURN;
  END IF;

  -- Make room before Wheels/Tires > Parts (sort_order 5 → 6).
  UPDATE categories
  SET sort_order = 6
  WHERE parent_id = wheels_tires_id
    AND slug = 'components-wheels-tires-parts'
    AND sort_order < 6;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'components-wheels-tires-tubeless',
    'Tubeless',
    wheels_tires_id,
    5,
    2,
    'Tubeless setup consumables and accessories: tubeless valve stems, rim tape, tire sealant, tubeless kits, and tire inserts (e.g. CushCore). Does NOT include tubeless-ready tires (use Tires), inner tubes (use Tubes), or install tools (use Accessories > Tools).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  SELECT id INTO tubeless_id FROM categories WHERE slug = 'components-wheels-tires-tubeless' LIMIT 1;

  UPDATE categories SET description = 'Wheels and tires for bikes. Use the most specific sub-category: complete wheelsets in Complete Wheels; single tires in Tires; tubeless valves, tape, sealant, and inserts in Tubeless; bare rims in Rims; etc.'
  WHERE slug = 'components-wheels-tires';

  UPDATE categories SET description = 'Individual bike tires only — tubeless-ready, tubed, folding, and wire-bead. Does NOT include tubes (use Tubes), tubeless valves/tape/sealant (use Tubeless), or tire inserts (use Tubeless).'
  WHERE slug = 'components-wheels-tires-tires';

  UPDATE categories SET description = 'Inner tubes for bike tires — butyl and latex, various valve types. Does NOT include tubeless kits, valves, tape, sealant, or tire inserts (use Tubeless).'
  WHERE slug = 'components-wheels-tires-tubes';

  UPDATE categories SET description = 'Wheel and tire hardware: spoke nipples, loose spokes, rim strips, thru-axles, and other miscellany. Does NOT include tubeless valves, rim tape, sealant, kits, or tire inserts (use Tubeless).'
  WHERE slug = 'components-wheels-tires-parts';

  -- Product-name backfill from misfiled buckets (exclude tools; do not pull from Tires / wheels / rims / hubs).
  IF tubeless_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = tubeless_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Tubeless']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ILIKE '%tubeless valve%'
        OR sl.product_name ILIKE '%tubeless tape%'
        OR sl.product_name ILIKE '%rim tape%'
        OR sl.product_name ILIKE '%tire tape%'
        OR sl.product_name ILIKE '%tubeless sealant%'
        OR sl.product_name ILIKE '%tire sealant%'
        OR sl.product_name ILIKE '%tyre sealant%'
        OR sl.product_name ILIKE '%tubeless kit%'
        OR sl.product_name ILIKE '%tubeless insert%'
        OR sl.product_name ILIKE '%tire insert%'
        OR sl.product_name ILIKE '%cushcore%'
        OR (
          sl.product_name ILIKE '%sealant%'
          AND sl.product_name NOT ILIKE '%injector%'
        )
      )
      AND sl.product_name NOT ILIKE '%tool%'
      AND sl.product_name NOT ILIKE '%injector%'
      AND sl.product_name NOT ILIKE '%lever%'
      AND sl.product_name NOT ILIKE '%bead dropper%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-wheels-tires-tubes',
            'components-wheels-tires-parts',
            'components-wheels-tires',
            'components',
            'accessories',
            'accessories-lights'
          )
        )
      );
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before legacy ~1000 priority seeds and the `tube`/`tubes` rule).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'tubeless valve', 'tubeless valves', 'tubeless valve stem', 'tubeless valve stems',
  'tubeless tape', 'rim tape', 'tire tape',
  'tubeless sealant', 'tire sealant', 'tyre sealant', 'tubeless sealants',
  'tubeless kit', 'tubeless kits',
  'tubeless insert', 'tubeless inserts', 'tire insert', 'tire inserts',
  'cushcore', 'tubeless systems', 'tubeless system'
]::text[],
       ARRAY['Components', 'Wheels/Tires', 'Tubeless']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'components-wheels-tires-tubeless' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-wheels-tires-tubeless')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990
      AND canonical = ARRAY['Components', 'Wheels/Tires', 'Tubeless']::text[]
  );
