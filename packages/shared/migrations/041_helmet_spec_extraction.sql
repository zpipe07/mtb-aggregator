-- Helmet spec extraction: coverage rubric, helmet intended_use override, extractable clothing_size.
-- Idempotent: safe to re-run.

ALTER TABLE llm_extraction_field_defs
  ADD COLUMN IF NOT EXISTS extractable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN llm_extraction_field_defs.extractable IS
  'When false, field appears in facets/schema but is omitted from LLM extraction (e.g. clothing_size from variant_options).';

-- Coverage: tightened decision tree (helmets only; field used on Helmets profile).
UPDATE llm_extraction_field_defs
SET
  description = 'Helmet shell coverage. Choose exactly one. Full face: integrated or non-removable chin bar (Fox Proframe, Bell Full-9, POC Coron, Leatt Gravity). Convertible: designed to ride as full-face and half-shell via removable chin bar (Bell Super DH/3R/Air, Giro Switchblade, MET Parachute, Lazer Revolution); chin-bar parts sold alone = null. 3/4 shell: hard shell encloses the ears / deep temporal wrap with no chin bar (Fox Dropframe, Giro Tyrant, Bell Sanction/Racket, skate-style BMX like Bell Span/Protec). Half shell: open-face; extended occipital wrap still counts (Bell 4Forty/Falcon/Nomad, POC Tectal/Cularis, Giro Artex, road/gravel lids). Do NOT use 3/4 just because marketing says extended coverage.',
  values = '["Half shell", "Full face", "3/4 shell", "Convertible"]'::jsonb,
  updated_at = NOW()
WHERE field_key = 'coverage';

-- clothing_size: derived from variant_options, not LLM.
UPDATE llm_extraction_field_defs
SET
  extractable = false,
  description = 'This listing''s size, copied from variant_options Size (not extracted by the LLM).',
  updated_at = NOW()
WHERE field_key = 'clothing_size';

-- Helmets profile: helmet-specific system prompt.
UPDATE llm_prompt_profiles
SET
  system_prompt = 'You are a mountain bike helmet spec extraction expert. Given a product listing, extract structured specs.

Coverage (choose exactly one):
- Full face: integrated or non-removable chin bar (e.g. Fox Proframe, Bell Full-9, POC Coron).
- Convertible: removable chin bar for full-face and half-shell modes (e.g. Bell Super DH/3R/Air, Giro Switchblade). Chin-bar replacement parts alone: null.
- 3/4 shell: hard shell encloses ears/temporal wrap, no chin bar (e.g. Fox Dropframe, Giro Tyrant, Bell Sanction/Racket, skate/BMX lids).
- Half shell: open-face trail/XC/road; extended occipital wrap is still half shell (e.g. Bell 4Forty/Falcon/Nomad, POC Tectal). Do not use 3/4 for marketing extended coverage alone.

Intended use: return all matching disciplines as an array. Use DH not Downhill. XC = race/lightweight; BMX/skate = BMX; dirt jump/park = Dirt Jump.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.',
  updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'gear-helmets' LIMIT 1);

-- Helmets profile: intended_use override (replaces Gear parent field via inheritance).
DO $$
DECLARE
  helmets_profile_id INT;
  intended_use_def_id INT;
BEGIN
  SELECT id INTO helmets_profile_id FROM llm_prompt_profiles WHERE category_id = (SELECT id FROM categories WHERE slug = 'gear-helmets' LIMIT 1) LIMIT 1;
  SELECT id INTO intended_use_def_id FROM llm_extraction_field_defs WHERE field_key = 'intended_use' LIMIT 1;

  IF helmets_profile_id IS NULL OR intended_use_def_id IS NULL THEN
    RAISE NOTICE '041: skip helmet intended_use composition — profile or def missing';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM llm_prompt_profile_fields pf
    WHERE pf.profile_id = helmets_profile_id AND pf.field_def_id = intended_use_def_id
  ) THEN
    INSERT INTO llm_prompt_profile_fields (profile_id, field_def_id, sort_order, overrides)
    VALUES (
      helmets_profile_id,
      intended_use_def_id,
      1,
      '{"type":"multi_enum","label":"Intended use","values":["XC","Trail","Enduro","DH","Dirt Jump","BMX","Road","Gravel","Commuter"],"description":"All cycling disciplines this helmet is designed for. Return every match as an array. Use DH not Downhill. XC = race/lightweight; BMX/skate = BMX; dirt jump/park = Dirt Jump; road/gravel/commuter from product name or marketing copy."}'::jsonb
    );
  ELSE
    UPDATE llm_prompt_profile_fields pf
    SET overrides = '{"type":"multi_enum","label":"Intended use","values":["XC","Trail","Enduro","DH","Dirt Jump","BMX","Road","Gravel","Commuter"],"description":"All cycling disciplines this helmet is designed for. Return every match as an array. Use DH not Downhill. XC = race/lightweight; BMX/skate = BMX; dirt jump/park = Dirt Jump; road/gravel/commuter from product name or marketing copy."}'::jsonb
    WHERE pf.profile_id = helmets_profile_id AND pf.field_def_id = intended_use_def_id;
  END IF;

  UPDATE llm_prompt_profile_fields pf
  SET sort_order = 2
  FROM llm_extraction_field_defs fd
  WHERE pf.profile_id = helmets_profile_id
    AND pf.field_def_id = fd.id
    AND fd.field_key = 'clothing_size';
END $$;

-- Remap legacy Downhill → DH on helmet listings.
UPDATE store_listings
SET metadata = jsonb_set(
  metadata,
  '{llm_specs,intended_use}',
  '"DH"'::jsonb,
  true
)
WHERE category_id = (SELECT id FROM categories WHERE slug = 'gear-helmets' LIMIT 1)
  AND metadata->'llm_specs'->>'intended_use' = 'Downhill';
