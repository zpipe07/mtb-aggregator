-- Components: Bottom Brackets (Drivetrain) + Headsets (Cockpit); mappings, backfill, LLM profiles.
-- Idempotent: safe to re-run on environments that already applied partial changes.

DO $$
DECLARE
  drivetrain_id INT;
  cockpit_id INT;
  bb_id INT;
  headset_id INT;
BEGIN
  SELECT id INTO drivetrain_id FROM categories WHERE slug = 'components-drivetrain' LIMIT 1;
  SELECT id INTO cockpit_id FROM categories WHERE slug = 'components-cockpit' LIMIT 1;

  IF drivetrain_id IS NULL OR cockpit_id IS NULL THEN
    RAISE NOTICE '032: missing components-drivetrain or components-cockpit — skip shelf inserts';
    RETURN;
  END IF;

  -- Make room before Drivetrain > Parts (sort_order 6).
  UPDATE categories
  SET sort_order = 7
  WHERE parent_id = drivetrain_id
    AND slug = 'components-drivetrain-parts'
    AND sort_order < 7;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'components-drivetrain-bottom-brackets',
    'Bottom Brackets',
    drivetrain_id,
    6,
    2,
    'Complete bottom bracket assemblies and bearing cups for connecting cranks to the frame. Includes threaded (BSA), press-fit (PF30, BB86/92), and T47 interfaces. Does NOT include bottom bracket tools, bearing presses, or wrenches (use Accessories > Tools) or cranksets (use Cranks).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  -- Make room before Cockpit > Parts (sort_order 5).
  UPDATE categories
  SET sort_order = 6
  WHERE parent_id = cockpit_id
    AND slug = 'components-cockpit-parts'
    AND sort_order < 6;

  INSERT INTO categories (slug, name, parent_id, sort_order, depth, description)
  VALUES (
    'components-cockpit-headsets',
    'Headsets',
    cockpit_id,
    5,
    2,
    'Complete headset assemblies and bearing cups for the head tube — threadless, integrated (IS), and external (EC/ZS) types. Does NOT include headset spacers, stem caps, top caps, or headset tools (use Cockpit > Parts or Accessories > Tools).'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    depth = EXCLUDED.depth,
    description = EXCLUDED.description;

  SELECT id INTO bb_id FROM categories WHERE slug = 'components-drivetrain-bottom-brackets' LIMIT 1;
  SELECT id INTO headset_id FROM categories WHERE slug = 'components-cockpit-headsets' LIMIT 1;

  -- Parent rubrics: steer classifier away from Parts / bare parent.
  UPDATE categories SET description = 'Drivetrain components for transmitting pedal power. Includes groupsets and individual parts: cassettes, derailleurs, cranks, chainrings, shifters, pedals, chains, and bottom brackets. Use the most specific sub-category when available (e.g. Bottom Brackets, not Parts).'
  WHERE slug = 'components-drivetrain';

  UPDATE categories SET description = 'Miscellaneous drivetrain parts that do not fit a more specific sub-category: chains, cable housing, jockey wheels, chain guides, and drivetrain hardware. Does NOT include bottom brackets (use Bottom Brackets), cranks, or chainrings.'
  WHERE slug = 'components-drivetrain-parts';

  UPDATE categories SET description = 'Cranksets and individual crank arms. Does NOT include chainrings (use Chainrings) or bottom brackets (use Bottom Brackets).'
  WHERE slug = 'components-drivetrain-cranks';

  UPDATE categories SET description = 'Handlebar area and rider interface components. Includes dropper seatposts, saddles, stems, handlebars, grips, and headsets. Does NOT include suspension forks (use Suspension > Forks) or pedals (use Drivetrain > Pedals).'
  WHERE slug = 'components-cockpit';

  UPDATE categories SET description = 'Small cockpit hardware: stem clamps, computer mounts, headset spacers, stem caps, dropper remote levers sold alone, and other cockpit miscellany. Does NOT include complete headsets (use Headsets).'
  WHERE slug = 'components-cockpit-parts';

  -- Bottom brackets: product-name backfill from Drivetrain buckets (exclude tools).
  IF bb_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = bb_id,
      canonical_category = ARRAY['Components', 'Drivetrain', 'Bottom Brackets']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND sl.product_name ILIKE '%bottom bracket%'
      AND sl.product_name NOT ILIKE '%tool%'
      AND sl.product_name NOT ILIKE '%press%'
      AND sl.product_name NOT ILIKE '%wrench%'
      AND sl.product_name NOT ILIKE '%puller%'
      AND sl.product_name NOT ILIKE '%installer%'
      AND sl.category_id IN (
        SELECT id FROM categories
        WHERE slug IN (
          'components-drivetrain',
          'components-drivetrain-parts',
          'components',
          'components-drivetrain-cranks'
        )
      );
  END IF;

  -- Headsets: backfill from Cockpit parent/Parts (exclude spacers, caps, tools).
  IF headset_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = headset_id,
      canonical_category = ARRAY['Components', 'Cockpit', 'Headsets']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND (
        sl.product_name ILIKE '%headset%'
        OR sl.product_name ILIKE '%head set%'
      )
      AND sl.product_name NOT ILIKE '%tool%'
      AND sl.product_name NOT ILIKE '%press%'
      AND sl.product_name NOT ILIKE '%spacer%'
      AND sl.product_name NOT ILIKE '%stemcap%'
      AND sl.product_name NOT ILIKE '%stem cap%'
      AND sl.product_name NOT ILIKE '%top cap%'
      AND sl.category_id IN (
        SELECT id FROM categories
        WHERE slug IN (
          'components-cockpit',
          'components-cockpit-parts',
          'components'
        )
      );
  END IF;
END $$;

-- High-priority taxonomy rows (evaluated before legacy ~1000 priority seeds).
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'bottom bracket', 'bottom brackets', 'bottom-bracket', 'bottom-brackets',
  'bb30', 'bb86', 'bb92', 'pf30', 'pf41', 't47', 'threaded bb', 'press-fit bb'
]::text[],
       ARRAY['Components', 'Drivetrain', 'Bottom Brackets']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'components-drivetrain-bottom-brackets' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-drivetrain-bottom-brackets')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990
      AND canonical = ARRAY['Components', 'Drivetrain', 'Bottom Brackets']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'headset', 'headsets', 'integrated headset', 'threadless headset',
  'headset bearing', 'headset bearings'
]::text[],
       ARRAY['Components', 'Cockpit', 'Headsets']::text[],
       1990,
       (SELECT id FROM categories WHERE slug = 'components-cockpit-headsets' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-cockpit-headsets')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1990
      AND canonical = ARRAY['Components', 'Cockpit', 'Headsets']::text[]
  );

-- LLM extraction field defs (shared library).
INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, values, filterable)
VALUES
  (
    'bb_standard',
    'enum',
    'Bottom bracket interface standard (e.g. BSA threaded, PF30, BB86/92, T47). Pick the closest match; use Other when unclear.',
    'BB standard',
    '["BSA","BB30","PF30","BB86/92","T47","DUB","Other"]'::jsonb,
    true
  ),
  (
    'bb_shell_width',
    'string',
    'Bottom bracket shell width in mm when stated (e.g. 68, 73, 83). Null if unknown.',
    'Shell width (mm)',
    NULL,
    true
  ),
  (
    'headset_standard',
    'enum',
    'Headset standard / bearing interface (ZS, EC, IS codes). Use the upper/lower pair when both are known; otherwise closest match or Other.',
    'Headset standard',
    '["ZS44/28.6","ZS44/30","ZS56/40","EC44/33","EC49/40","IS41/52","IS42/52","Other"]'::jsonb,
    true
  )
ON CONFLICT (field_key) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  description = EXCLUDED.description,
  label = EXCLUDED.label,
  values = EXCLUDED.values,
  filterable = EXCLUDED.filterable,
  updated_at = NOW();

-- LLM prompt profiles for spec extraction + facet filters.
DO $$
DECLARE
  bb_cat_id INT;
  headset_cat_id INT;
  bb_profile_id INT;
  headset_profile_id INT;
  bb_standard_def_id INT;
  bb_shell_def_id INT;
  headset_standard_def_id INT;
  sys_prompt TEXT := 'You are a mountain bike spec extraction expert. Given a product listing, extract structured specs.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.';
BEGIN
  SELECT id INTO bb_cat_id FROM categories WHERE slug = 'components-drivetrain-bottom-brackets' LIMIT 1;
  SELECT id INTO headset_cat_id FROM categories WHERE slug = 'components-cockpit-headsets' LIMIT 1;
  SELECT id INTO bb_standard_def_id FROM llm_extraction_field_defs WHERE field_key = 'bb_standard' LIMIT 1;
  SELECT id INTO bb_shell_def_id FROM llm_extraction_field_defs WHERE field_key = 'bb_shell_width' LIMIT 1;
  SELECT id INTO headset_standard_def_id FROM llm_extraction_field_defs WHERE field_key = 'headset_standard' LIMIT 1;

  IF bb_cat_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM llm_prompt_profiles WHERE category_id = bb_cat_id
  ) THEN
    INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema, enabled, category_id)
    VALUES (
      ARRAY['Components', 'Drivetrain', 'Bottom Brackets']::text[],
      'Bottom Brackets',
      sys_prompt,
      '{"fields":[]}'::jsonb,
      true,
      bb_cat_id
    )
    RETURNING id INTO bb_profile_id;

    INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
    VALUES
      (bb_profile_id, bb_standard_def_id, 0, '{}'::jsonb),
      (bb_profile_id, bb_shell_def_id, 1, '{}'::jsonb);
  END IF;

  IF headset_cat_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM llm_prompt_profiles WHERE category_id = headset_cat_id
  ) THEN
    INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema, enabled, category_id)
    VALUES (
      ARRAY['Components', 'Cockpit', 'Headsets']::text[],
      'Headsets',
      sys_prompt,
      '{"fields":[]}'::jsonb,
      true,
      headset_cat_id
    )
    RETURNING id INTO headset_profile_id;

    INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
    VALUES (headset_profile_id, headset_standard_def_id, 0, '{}'::jsonb);
  END IF;
END $$;
