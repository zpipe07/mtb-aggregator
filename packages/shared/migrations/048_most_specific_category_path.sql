-- ZAC-245: scrape taxonomy should land complete-wheel store paths on
-- Components › Wheels/Tires › Complete wheels. Generic "bike" / "gravel"
-- (seed ~980) beat bare "wheels" on leaves like "Gravel Bike Wheels and
-- Wheelsets". High-priority wheelset / bike-wheels keywords run first.
-- Pair with taxonomy.Map matching the rightmost breadcrumb segment.
-- Mapping-only; no listing writes.
--
-- Also point the legacy ["Components", "Wheels"] catch-all at the live
-- Wheels/Tires node so ResolveCategoryIDFromPath can attach category_id.

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
       'wheelset',
       'wheelsets',
       'complete wheel',
       'complete wheels',
       'bike wheels',
       'bike wheel'
     ]::text[],
       ARRAY['Components', 'Wheels/Tires', 'Complete wheels']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'components-wheels-tires-complete-wheels' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-wheels-tires-complete-wheels')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE 'wheelset' = ANY (raw_keywords)
  );

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Wheels/Tires']::text[],
    category_id = (SELECT id FROM categories WHERE slug = 'components-wheels-tires' LIMIT 1),
    updated_at = NOW()
WHERE canonical = ARRAY['Components', 'Wheels']::text[]
  AND EXISTS (SELECT 1 FROM categories WHERE slug = 'components-wheels-tires');
