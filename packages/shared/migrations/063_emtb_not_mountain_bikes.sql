-- ZAC-296: eMTBs were landing on Mountain Bikes.
-- taxonomy.RefineElectric treated Bikes › Electric Mountain Bikes like the
-- generic Electric Bikes trap (ZAC-273) because the name starts with "Electric ".
-- Titles such as "Santa Cruz Bullit Carbon MX … 2026" match the analog-complete
-- pattern and do not say "e-bike", so ingest, recategorize, and classify rewrote
-- them to Mountain Bikes while llm_category.reasoning still said Full Power eMTB.
-- Pair with the RefineElectric exemption. Idempotent.
--
-- Does not touch the borderline SCOR 4060 Z ST "E-Bike" (retailer path is
-- Mountain Bikes, not an eMTB shelf) or hybrid e-bikes such as Giant Roam E+.

-- ---------------------------------------------------------------------------
-- 1. Generic Electric Bikes mapping must not claim eMTB phrases.
--    Higher-priority row already maps these to Electric Mountain Bikes.
--    Leaving them here sends a path to Electric Bikes if that row ever
--    sorts first, and RefineElectric then demotes the bike to Mountain.
-- ---------------------------------------------------------------------------
UPDATE category_mappings
SET
  raw_keywords = ARRAY(
    SELECT kw
    FROM unnest(raw_keywords) AS kw
    WHERE lower(kw) NOT IN ('e-mountain bike', 'electric mountain bike')
  ),
  updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'bikes-electric')
  AND EXISTS (
    SELECT 1
    FROM unnest(raw_keywords) AS kw
    WHERE lower(kw) IN ('e-mountain bike', 'electric mountain bike')
  );

-- ---------------------------------------------------------------------------
-- 2. Store path is explicitly eMTB, but canonical is still an analog MTB shelf.
--    Parent Electric Mountain Bikes is enough; Full Power vs Lightweight stays
--    with the classifier. Skip manual overrides.
-- ---------------------------------------------------------------------------
UPDATE store_listings sl
SET
  canonical_category = ARRAY['Bikes', 'Electric Mountain Bikes']::text[],
  category_id = (SELECT id FROM categories WHERE slug = 'bikes-emtb')
WHERE COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
  AND sl.category_id IN (
    SELECT id FROM categories WHERE slug IN (
      'bikes-mountain',
      'bikes-mountain-xc',
      'bikes-mountain-trail',
      'bikes-mountain-enduro',
      'bikes-mountain-downhill',
      'bikes-mountain-dirt-jump',
      'bikes-mountain-fat-bike'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM unnest(COALESCE(sl.category_path, '{}'::text[])) AS seg
    WHERE seg ~* '(e-?mtb|e-mountain|emountain|electric[[:space:]]+mountain)'
  );

-- ---------------------------------------------------------------------------
-- 3. Classifier already explained these as eMTBs, then title refine stored
--    Mountain Bikes in llm_category.canonical_category. Point that field at
--    the listing's current eMTB path so a later "trust llm_category" pass
--    cannot undo the shelf. Reasoning text is left as-is.
-- ---------------------------------------------------------------------------
UPDATE store_listings sl
SET metadata = jsonb_set(
  sl.metadata,
  '{llm_category,canonical_category}',
  to_jsonb(sl.canonical_category),
  true
)
WHERE sl.category_id IN (
    SELECT id FROM categories WHERE slug IN (
      'bikes-emtb',
      'bikes-emtb-full-power',
      'bikes-emtb-lightweight'
    )
  )
  AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
  AND jsonb_typeof(sl.metadata->'llm_category'->'canonical_category') = 'array'
  AND sl.metadata->'llm_category'->'canonical_category' = '["Bikes","Mountain Bikes"]'::jsonb
  AND sl.canonical_category IS DISTINCT FROM ARRAY(
    SELECT jsonb_array_elements_text(sl.metadata->'llm_category'->'canonical_category')
  )
  AND (
    COALESCE(sl.metadata->'llm_category'->>'reasoning', '') ~* '(e-?mtb|e-mountain|electric mountain|full[- ]power)'
  );
