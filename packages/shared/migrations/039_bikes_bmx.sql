-- Bikes: BMX Bikes leaf; mappings, product-name backfill, intended_use enum, classifier rubrics, LLM profile.
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  bikes_id INT;
  bmx_id INT;
  next_sort INT;
  sys_prompt TEXT := 'You are a mountain bike spec extraction expert. Given a product listing, extract structured specs.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.';
  bmx_profile_id INT;
  intended_use_def_id INT;
  wheel_size_def_id INT;
  confidence_def_id INT;
BEGIN
  SELECT id INTO bikes_id FROM categories WHERE slug = 'bikes' LIMIT 1;

  IF bikes_id IS NULL THEN
    RAISE NOTICE '039: missing categories.bikes — skip BMX shelf insert';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_sort
  FROM categories WHERE parent_id = bikes_id;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'bikes-bmx',
    'BMX Bikes',
    bikes_id,
    next_sort,
    1,
    'Complete BMX bicycles: 20", 18", 16", 24" cruiser, freestyle, and park builds with BMX geometry (gyro, short wheelbase). Does NOT include dirt-jump MTB hardtails (use Mountain > Dirt Jump), kids balance or youth MTB bikes (use Kids), BMX frames sold alone (use Frames), or BMX parts and gear (use Components / Gear with intended_use BMX).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  SELECT id INTO bmx_id FROM categories WHERE slug = 'bikes-bmx' LIMIT 1;

  UPDATE categories SET description = 'Bicycles and bike frames. Use the most specific sub-category: Mountain (XC, Trail, Enduro, etc.), Electric Mountain Bikes, BMX Bikes, Road, Gravel, Electric, Kids, or Frames. NOT bike components (use Components) or riding gear (use Gear).'
  WHERE slug = 'bikes';

  UPDATE categories SET description = 'Dirt jump and slopestyle hardtail mountain bikes (typically 26" or 27.5" wheels, MTB geometry). Does NOT include 20" BMX bikes or complete BMX builds (use BMX Bikes).'
  WHERE slug = 'bikes-mountain-dirt-jump';

  UPDATE categories SET description = 'Youth and kids bicycles: balance bikes, pedal bikes, and youth mountain bikes. Does NOT include complete BMX bikes (use BMX Bikes).'
  WHERE slug = 'bikes-kids';

  UPDATE categories SET description = 'Bike frames sold without a complete build. Includes mountain, road, gravel, and BMX frames. Does NOT include complete bicycles (use the appropriate Bikes sub-category).'
  WHERE slug = 'bikes-frames';

  -- Product-name backfill from misfiled bike buckets (exclude parts and frames-only).
  IF bmx_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = bmx_id,
      canonical_category = ARRAY['Bikes', 'BMX Bikes']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND sl.product_name ~* '\mbmx\M'
      AND sl.product_name NOT ILIKE '%helmet%'
      AND sl.product_name NOT ILIKE '%goggle%'
      AND sl.product_name NOT ILIKE '%pad%'
      AND sl.product_name NOT ILIKE '%peg%'
      AND sl.product_name NOT ILIKE '%stem%'
      AND sl.product_name NOT ILIKE '%grip%'
      AND sl.product_name NOT ILIKE '%grips%'
      AND sl.product_name NOT ILIKE '%tire%'
      AND sl.product_name NOT ILIKE '%tyre%'
      AND sl.product_name NOT ILIKE '%tube%'
      AND sl.product_name NOT ILIKE '%pedal%'
      AND sl.product_name NOT ILIKE '%chain%'
      AND sl.product_name NOT ILIKE '%sprocket%'
      AND sl.product_name NOT ILIKE '%crank%'
      AND sl.product_name NOT ILIKE '%handlebar%'
      AND sl.product_name NOT ILIKE '%handlebars%'
      AND sl.product_name NOT ILIKE '%bar %'
      AND sl.product_name NOT ILIKE '% bars%'
      AND sl.product_name NOT ILIKE '%seat%'
      AND sl.product_name NOT ILIKE '%saddle%'
      AND sl.product_name NOT ILIKE '%rim%'
      AND sl.product_name NOT ILIKE '%hub%'
      AND sl.product_name NOT ILIKE '%fork%'
      AND sl.product_name NOT ILIKE '%brake%'
      AND sl.product_name NOT ILIKE '%rotor%'
      AND sl.product_name NOT ILIKE '%lever%'
      AND sl.product_name NOT ILIKE '%cable%'
      AND sl.product_name NOT ILIKE '%number plate%'
      AND sl.product_name NOT ILIKE '%numberplate%'
      AND NOT (sl.product_name ILIKE '%frame%' AND sl.product_name NOT ILIKE '%bike%' AND sl.product_name NOT ILIKE '%bicycle%' AND sl.product_name NOT ILIKE '%complete%')
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'bikes',
            'bikes-mountain',
            'bikes-mountain-dirt-jump',
            'bikes-kids',
            'bikes-electric',
            'bikes-emtb',
            'bikes-gravel',
            'bikes-road'
          )
        )
      )
      AND (
        sl.category_id IS NOT NULL
        OR sl.product_name ~* '\m(bike|bicycle|complete)\M'
      );
  END IF;

  -- LLM prompt profile for BMX bikes (wheel_size, frame_material, intended_use — no travel fields).
  SELECT id INTO intended_use_def_id FROM llm_extraction_field_defs WHERE field_key = 'intended_use' LIMIT 1;
  SELECT id INTO wheel_size_def_id FROM llm_extraction_field_defs WHERE field_key = 'wheel_size' LIMIT 1;
  SELECT id INTO confidence_def_id FROM llm_extraction_field_defs WHERE field_key = 'confidence' LIMIT 1;

  IF bmx_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM llm_prompt_profiles WHERE category_id = bmx_id
  ) THEN
    INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema, enabled, category_id)
    VALUES (
      ARRAY['Bikes', 'BMX Bikes']::text[],
      'BMX Bikes',
      sys_prompt,
      '{"fields":[]}'::jsonb,
      true,
      bmx_id
    )
    RETURNING id INTO bmx_profile_id;

    IF intended_use_def_id IS NOT NULL THEN
      INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
      VALUES (
        bmx_profile_id,
        intended_use_def_id,
        1,
        '{"values": ["BMX"], "label": "Intended use", "description": "Intended use of the BMX bike."}'::jsonb
      );
    END IF;

    IF wheel_size_def_id IS NOT NULL THEN
      INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
      VALUES (
        bmx_profile_id,
        wheel_size_def_id,
        2,
        '{"values": ["20", "18", "16", "24", "22"], "label": "Wheel Size", "description": "BMX wheel size in inches."}'::jsonb
      );
    END IF;

    INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides, inline_field)
    VALUES (
      bmx_profile_id,
      NULL,
      3,
      '{}'::jsonb,
      '{"key": "frame_material", "type": "enum", "label": "Frame Material", "values": ["Chromoly", "Aluminum", "Steel", "Carbon", "Other"], "sort_order": 3, "description": "Frame material"}'::jsonb
    );

    IF confidence_def_id IS NOT NULL THEN
      INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
      VALUES (bmx_profile_id, confidence_def_id, 99, '{}'::jsonb);
    END IF;
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before Dirt Jump at 1990 and Kids seed ~1000).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'bmx bike', 'bmx bikes', 'complete bmx', 'freestyle bmx', 'bmx / dirt jump'
]::text[],
       ARRAY['Bikes', 'BMX Bikes']::text[],
       2000,
       (SELECT id FROM categories WHERE slug = 'bikes-bmx' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-bmx')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 2000
      AND canonical = ARRAY['Bikes', 'BMX Bikes']::text[]
  );

-- Append BMX to shared intended_use library enum.
UPDATE llm_extraction_field_defs
SET values = '["XC","Trail","Enduro","DH","Dirt Jump","Fat Bike","E-bike","BMX"]'::jsonb,
    updated_at = NOW()
WHERE field_key = 'intended_use'
  AND NOT (values ? 'BMX');

-- Append BMX to per-profile intended_use overrides that define a values array.
UPDATE llm_prompt_profile_fields pf
SET overrides = jsonb_set(
  pf.overrides,
  '{values}',
  (pf.overrides->'values') || '"BMX"'::jsonb
)
FROM llm_extraction_field_defs fd
WHERE pf.field_def_id = fd.id
  AND fd.field_key = 'intended_use'
  AND pf.overrides ? 'values'
  AND jsonb_typeof(pf.overrides->'values') = 'array'
  AND NOT (pf.overrides->'values' ? 'BMX');

-- Append BMX to legacy extraction_schema JSON on profiles that inline intended_use values.
UPDATE llm_prompt_profiles p
SET
  extraction_schema = jsonb_set(
    p.extraction_schema,
    '{fields}',
    (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN f->>'key' = 'intended_use'
            AND f ? 'values'
            AND jsonb_typeof(f->'values') = 'array'
            AND NOT (f->'values' ? 'BMX')
          THEN jsonb_set(f, '{values}', (f->'values') || '"BMX"'::jsonb)
          ELSE f
        END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(p.extraction_schema->'fields') AS f
    )
  ),
  updated_at = NOW()
WHERE p.extraction_schema->'fields' IS NOT NULL
  AND jsonb_typeof(p.extraction_schema->'fields') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p.extraction_schema->'fields') AS f
    WHERE f->>'key' = 'intended_use'
      AND f ? 'values'
      AND jsonb_typeof(f->'values') = 'array'
      AND NOT (f->'values' ? 'BMX')
  );
