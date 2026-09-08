-- ZAC-241: bicycle frame size as an LLM-extractable, filterable spec (Bikes tree).
-- Idempotent: safe to re-run.

INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, values, filterable, extractable)
VALUES (
  'bike_size',
  'enum',
  'Rider/frame size of THIS listing — not wheel size. Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large). Specialized S-sizing: S1–S6 when the listing uses that system. Numeric MTB frame sizes in inches (13–23) only when that is the stated size. Null if this row is a size-run without a single size, or size is unknown. Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.',
  'Size',
  '["XXS","XS","S","M","L","XL","XXL","S1","S2","S3","S4","S5","S6","13","14","15","16","17","18","19","20","21","23"]'::jsonb,
  true,
  true
)
ON CONFLICT (field_key) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  description = EXCLUDED.description,
  label = EXCLUDED.label,
  values = EXCLUDED.values,
  filterable = EXCLUDED.filterable,
  extractable = EXCLUDED.extractable,
  updated_at = NOW();

DO $$
DECLARE
  bikes_id INT;
  bikes_profile_id INT;
  bike_size_def_id INT;
  size_rubric TEXT := E'
Frame size (bike_size): the rider size of THIS listing, not wheel size.
- Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large).
- Specialized S-sizing: S1–S6 when the listing uses that system.
- Numeric frame sizes in inches (15, 17, 19, …) only when that is the stated size.
- Null if the listing is a size-run without a single size, or size is unknown.
- Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.';
  bikes_prompt TEXT := 'You are a bicycle spec extraction expert. Given a product listing, extract structured specs.

Frame size (bike_size): the rider size of THIS listing, not wheel size.
- Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large).
- Specialized S-sizing: S1–S6 when the listing uses that system.
- Numeric frame sizes in inches (15, 17, 19, …) only when that is the stated size.
- Null if the listing is a size-run without a single size, or size is unknown.
- Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.';
BEGIN
  SELECT id INTO bikes_id FROM categories WHERE slug = 'bikes' LIMIT 1;
  SELECT id INTO bike_size_def_id FROM llm_extraction_field_defs WHERE field_key = 'bike_size' LIMIT 1;

  IF bikes_id IS NULL OR bike_size_def_id IS NULL THEN
    RAISE NOTICE '050: skip Bikes bike_size profile — category or field def missing';
    RETURN;
  END IF;

  SELECT id INTO bikes_profile_id
  FROM llm_prompt_profiles
  WHERE category_id = bikes_id
  LIMIT 1;

  IF bikes_profile_id IS NULL THEN
    INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema, enabled, category_id)
    VALUES (
      ARRAY['Bikes']::text[],
      'Bikes',
      bikes_prompt,
      '{"fields":[]}'::jsonb,
      true,
      bikes_id
    )
    RETURNING id INTO bikes_profile_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM llm_prompt_profile_fields pf
    WHERE pf.profile_id = bikes_profile_id AND pf.field_def_id = bike_size_def_id
  ) THEN
    INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
    VALUES (bikes_profile_id, bike_size_def_id, 0, '{}'::jsonb);
  END IF;
END $$;

-- Nearest profiles win for system_prompt; append the size rubric on bike-specific profiles.
UPDATE llm_prompt_profiles
SET
  system_prompt = system_prompt || E'\n\nFrame size (bike_size): the rider size of THIS listing, not wheel size.
- Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large).
- Specialized S-sizing: S1–S6 when the listing uses that system.
- Numeric frame sizes in inches (15, 17, 19, …) only when that is the stated size.
- Null if the listing is a size-run without a single size, or size is unknown.
- Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.',
  updated_at = NOW()
WHERE category_id IN (
  SELECT id FROM categories WHERE slug IN ('bikes-mountain', 'bikes-frames', 'bikes-bmx')
)
  AND system_prompt NOT ILIKE '%bike_size%';
