-- ZAC-273: Ride Bicycles (and similar) tag pads, tools, locks, and analog
-- MTBs with Shopify product_type "Electric Commuter & Urban Bikes".
-- taxonomy.Map substring-matches "electric commuter" → Bikes › Electric Bikes.
-- Scrape upsert keeps the first canonical, so LLM Cat can be right while
-- canonical stays Electric. Pair with taxonomy.RefineElectric (title) and
-- scraper rejection of that product_type. Restart the API after apply so
-- in-memory refine reloads. Idempotent. Includes hidden rows — upsert
-- preserves canonical when a SKU returns to /sale.

-- ---------------------------------------------------------------------------
-- 1. Classifier rubrics
-- ---------------------------------------------------------------------------
UPDATE categories SET description = 'Non-MTB electric bikes (commuter, city, road, cargo e-bikes). Complete e-bikes only. Does NOT include analog mountain bikes (Transition Patrol, enduro/trail hardtails) just because the store path says Electric Commuter. Does NOT include brake pads, tools, locks, batteries, chargers, droppers, or other parts/accessories — even when Shopify product_type is "Electric Commuter & Urban Bikes".'
WHERE slug = 'bikes-electric';

UPDATE categories SET description = 'Electric mountain bikes (eMTBs) with a motor and battery, including Full Power and Lightweight children. Complete eMTBs only (Norco VLT, Transition Relay/Repeater, Turbo Levo). Does NOT include analog MTBs without a motor. Does NOT include e-bike batteries, chargers, displays, or other parts sold alone.'
WHERE slug = 'bikes-emtb';

UPDATE categories SET description = 'Complete bicycles. Use the most specific child: Mountain, Electric Mountain, Electric (non-MTB e-bikes), Road, Gravel, Kids, BMX, Frames. Store paths that say Electric Commuter are often a junk Shopify product_type — do not put parts, tools, or analog MTBs on Electric / eMTB because of that breadcrumb.'
WHERE slug = 'bikes';

-- ---------------------------------------------------------------------------
-- 2. Copy confident LLM onto canonical when stuck on the Electric tree
-- ---------------------------------------------------------------------------
WITH RECURSIVE cat_tree(id, path) AS (
  SELECT id, ARRAY[name]::text[] FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, (ct.path || c.name)::text[]
  FROM categories c
  JOIN cat_tree ct ON c.parent_id = ct.id
),
src AS (
  SELECT
    sl.id,
    sl.canonical_category,
    ARRAY(
      SELECT jsonb_array_elements_text(sl.metadata->'llm_category'->'canonical_category')
    ) AS raw_path
  FROM store_listings sl
  WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
    AND sl.canonical_category[1] = 'Bikes'
    AND sl.canonical_category[2] ILIKE 'Electric%'
    AND sl.metadata->'llm_category'->'canonical_category' IS NOT NULL
    AND jsonb_typeof(sl.metadata->'llm_category'->'canonical_category') = 'array'
    AND sl.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
    AND (sl.metadata->'llm_category'->>'confidence')::float >= 0.5
),
norm AS (
  SELECT
    id,
    CASE
      WHEN raw_path[cardinality(raw_path)] IN (
        'Enduro', 'Trail', 'XC', 'Downhill', 'Dirt Jump',
        'Electric', 'Mountain', 'Kids', 'Road', 'Gravel', 'Commuter'
      )
      THEN raw_path[1:cardinality(raw_path) - 1]
           || ARRAY[raw_path[cardinality(raw_path)] || ' Bikes']
      ELSE raw_path
    END AS llm_path
  FROM src
  WHERE cardinality(raw_path) > 0
    AND raw_path IS DISTINCT FROM canonical_category
)
UPDATE store_listings sl
SET
  canonical_category = norm.llm_path,
  category_id = COALESCE(
    (SELECT t.id FROM cat_tree t WHERE t.path = norm.llm_path LIMIT 1),
    sl.category_id
  )
FROM norm
WHERE sl.id = norm.id
  AND sl.canonical_category IS DISTINCT FROM norm.llm_path;

-- ---------------------------------------------------------------------------
-- 3. Title backfill: analog complete bikes / framesets still on Electric
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  mountain_id INT;
  frames_id INT;
BEGIN
  SELECT id INTO mountain_id FROM categories WHERE slug = 'bikes-mountain' LIMIT 1;
  SELECT id INTO frames_id FROM categories WHERE slug = 'bikes-frames' LIMIT 1;

  IF frames_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = frames_id,
      canonical_category = ARRAY['Bikes', 'Frames']::text[]
    WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND sl.canonical_category[1] = 'Bikes'
      AND sl.canonical_category[2] ILIKE 'Electric%'
      AND sl.product_name ~* '\mframesets?\M'
      AND sl.product_name !~* '\me-?bikes?\M'
      AND sl.product_name !~* '\mebikes?\M'
      AND sl.product_name !~* '\me-?mtbs?\M'
      AND sl.product_name !~* '\memtbs?\M'
      AND sl.product_name !~* '\mvlt\M'
      AND sl.product_name !~* '\mrepeaters?\M'
      AND sl.product_name !~* '\mrelays?\M';
  END IF;

  IF mountain_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = mountain_id,
      canonical_category = ARRAY['Bikes', 'Mountain Bikes']::text[]
    WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND sl.canonical_category[1] = 'Bikes'
      AND sl.canonical_category[2] ILIKE 'Electric%'
      AND sl.product_name !~* '\me-?bikes?\M'
      AND sl.product_name !~* '\mebikes?\M'
      AND sl.product_name !~* '\me-?mtbs?\M'
      AND sl.product_name !~* '\memtbs?\M'
      AND sl.product_name !~* '\melectric\s+(mountain|commuter|bike)\M'
      AND sl.product_name !~* '\mvlt\M'
      AND sl.product_name !~* '\mrepeaters?\M'
      AND sl.product_name !~* '\mrelays?\M'
      AND sl.product_name !~* '\mcomo\M'
      AND sl.product_name !~* '\mvados?\M'
      AND (
        (
          sl.product_name ~* '20[0-3][0-9]'
          AND sl.product_name ~* '(carbon|alloy|framesets?|\mgx\M|\mx0\M|\mx01\M|\meagle\M|\maxs\M)'
        )
        OR sl.product_name ~* '\mcarbon\s+(gx|x0|x01|eagle|axs)\M'
        OR sl.product_name ~* '\malloy\s+(gx|x0|x01|pnw|eagle)\M'
        OR sl.product_name ~* '\m(enduro|downhill|trail|xc)\s+bikes?\M'
        OR sl.product_name ~* '\mhardtails?\M'
        OR sl.product_name ~* '\mfat\s+bikes?\M'
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Clear non-bike titles still on Electric (parts, tools, locks, pads)
-- ---------------------------------------------------------------------------
UPDATE store_listings sl
SET
  canonical_category = NULL,
  category_id = NULL
WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
  AND sl.canonical_category[1] = 'Bikes'
  AND sl.canonical_category[2] ILIKE 'Electric%'
  AND sl.product_name !~* '\me-?bikes?\M'
  AND sl.product_name !~* '\mebikes?\M'
  AND sl.product_name !~* '\me-?mtbs?\M'
  AND sl.product_name !~* '\memtbs?\M'
  AND sl.product_name !~* '\melectric\s+(mountain|commuter|bike)\M'
  AND sl.product_name !~* '\mvlt\M'
  AND sl.product_name !~* '\mrepeaters?\M'
  AND sl.product_name !~* '\mrelays?\M'
  AND sl.product_name !~* '\mcomo\M'
  AND sl.product_name !~* '\mvados?\M'
  AND sl.product_name !~* '\mteros?\M'
  AND sl.product_name !~* '\mkenevos?\M'
  AND sl.product_name !~* '\mfuel\s+exe\M'
  AND (
    sl.product_name ~* '\mbrake\s+pads?\M'
    OR sl.product_name ~* '\mdisc\s+brake\s+pads?\M'
    OR sl.product_name ~* '\mbrakesets?\M'
    OR sl.product_name ~* '\mbrake\s+levers?\M'
    OR sl.product_name ~* '\mhydraulic\s+brake\M'
    OR sl.product_name ~* '\mdisc\s+brakes?\M'
    OR sl.product_name ~* '\mcalipers?\M'
    OR sl.product_name ~* '\mrotors?\M'
    OR sl.product_name ~* '\mdroppers?\M'
    OR sl.product_name ~* '\mseatposts?\M'
    OR sl.product_name ~* '\msaddles?\M'
    OR sl.product_name ~* '\mpark\s+tool\M'
    OR sl.product_name ~* '\mtorque\s+wrench\M'
    OR sl.product_name ~* '\mwrenches?\M'
    OR sl.product_name ~* '\mpliers?\M'
    OR sl.product_name ~* '\mspanners?\M'
    OR sl.product_name ~* '\mrepair\s+stands?\M'
    OR sl.product_name ~* '\mu-?locks?\M'
    OR sl.product_name ~* '\mchain\s+locks?\M'
    OR sl.product_name ~* '\mcable\s+locks?\M'
    OR sl.product_name ~* '\mfolding\s+locks?\M'
    OR sl.product_name ~* '\mknee\s+(guards?|armor)\M'
    OR sl.product_name ~* '\melbow\s+(guards?|armor)\M'
    OR sl.product_name ~* '\mbatter(?:y|ies)\M'
    OR sl.product_name ~* '\mchargers?\M'
    OR sl.product_name ~* '\mgauges?\M'
    OR sl.product_name ~* '\mtools?\M'
  );

-- ---------------------------------------------------------------------------
-- 5. Classifier system prompt
-- ---------------------------------------------------------------------------
UPDATE llm_category_classifier
SET
  system_prompt = system_prompt || E'\n\nBikes > Electric Bikes / Electric Mountain Bikes are complete e-bikes only. A store breadcrumb or Shopify product_type of "Electric Commuter & Urban Bikes" is often a junk catch-all (Ride Bicycles): analog MTBs (Transition Patrol), brake pads, tools, locks, and batteries must NOT stay on Electric. Use the product title — not that path — to pick Mountain / Components / Accessories / Gear.',
  updated_at = NOW()
WHERE system_prompt NOT ILIKE '%Electric Commuter & Urban Bikes%';
