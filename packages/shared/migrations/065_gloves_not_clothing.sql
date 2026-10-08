-- ZAC-311: riding gloves were parked on Gear › Clothing.
--
-- category_mappings id 14 (priority 60, Gear › Clothing) includes bare "glove"
-- alongside "clothing" and "short". taxonomy.Map tries the rightmost breadcrumb
-- first and the first keyword hit wins, so "Women's Mountain Bike Gloves",
-- "MTB Gloves", "Road/XC Gloves", and "Men's Short Finger Cycling Gloves" all
-- match Clothing before "mountain bike" (priority 4). Nothing mapped to
-- Gear › Gloves. A later name backfill then moved short-finger titles onto
-- Shorts and softshell titles onto Jackets because those names contain "short"
-- / "softshell".
--
-- Upsert keeps the first canonical, so new scrapes keep landing on Clothing.
-- This migration:
--   1. Adds glove/gloves → Gear › Gloves at priority 2020 (above Clothing
--      phrases at 2010, apparel leaves at 1990, and the legacy glove/short row).
--   2. Drops glove/gloves from the Clothing keyword row.
--   3. Moves existing glove, mitt, and underglove titles off the Clothing tree.
--      Also moves glove titles off the Gear parent, Accessories, and Shoes.
--      Skips manual overrides, Glacier Glove hats, cleaning gloves, and cables
--      whose colorway says "Gloves".
--
-- Hidden and out-of-stock rows are included. In-stock Competitive Cyclist
-- gloves are hidden today; leaving them on Clothing would put them back on
-- the apparel shelf the next time a scrape unhides them.
--
-- Restart the API after apply so in-memory mappings reload. Pair with
-- taxonomy.RefineGloves (title still wins when the breadcrumb is only
-- "Clothing" or "Clothing & Protective Gear", and when a short-finger glove
-- was refined onto Shorts).

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY['glove', 'gloves']::text[],
       ARRAY['Gear', 'Gloves']::text[],
       2020,
       (SELECT id FROM categories WHERE slug = 'gear-gloves' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-gloves')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE canonical = ARRAY['Gear', 'Gloves']::text[]
      AND 'glove' = ANY (raw_keywords)
  );

UPDATE category_mappings
SET
  raw_keywords = ARRAY(
    SELECT kw
    FROM unnest(raw_keywords) AS kw
    WHERE lower(kw) NOT IN ('glove', 'gloves')
  ),
  updated_at = NOW()
WHERE (
    category_id = (SELECT id FROM categories WHERE slug = 'gear-clothing' LIMIT 1)
    OR canonical = ARRAY['Gear', 'Clothing']::text[]
  )
  AND EXISTS (
    SELECT 1
    FROM unnest(raw_keywords) AS kw
    WHERE lower(kw) IN ('glove', 'gloves')
  );

UPDATE store_listings sl
SET
  category_id = (SELECT id FROM categories WHERE slug = 'gear-gloves' LIMIT 1),
  canonical_category = ARRAY['Gear', 'Gloves']::text[]
WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
  AND EXISTS (SELECT 1 FROM categories WHERE slug = 'gear-gloves')
  AND sl.category_id IN (
    SELECT id FROM categories
    WHERE slug = 'gear-clothing'
       OR slug LIKE 'gear-clothing-%'
       OR slug IN ('gear', 'accessories', 'gear-shoes')
  )
  AND sl.product_name !~* '\m(hats?|caps?|cables?)\M'
  AND sl.product_name !~* 'cleaning[[:space:]]+gloves?'
  AND sl.product_name !~* '\mscrubbers?\M'
  AND (
    (
      sl.category_id IN (
        SELECT id FROM categories
        WHERE slug = 'gear-clothing' OR slug LIKE 'gear-clothing-%'
      )
      AND sl.product_name ~* '\m(gloves?|mitts?|mittens?|undergloves?)\M'
    )
    OR (
      sl.category_id IN (
        SELECT id FROM categories
        WHERE slug IN ('gear', 'accessories', 'gear-shoes')
      )
      AND sl.product_name ~* '\mgloves?\M'
    )
  );
