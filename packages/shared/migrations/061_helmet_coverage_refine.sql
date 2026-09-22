-- ZAC-277: Helmet Coverage — stop half-shells flooding 3/4 / Full face / Convertible.
-- Idempotent. Locked defs (Zack, 2026-09-14):
--   Half shell = does not cover the ears
--   3/4 shell  = covers top/back/sides AND the ears (no chin bar)
--   Full face  = fixed / non-removable chin bar
--   Convertible = removable chin bar
-- Known-good 3/4: Fox Dropframe / Dropframe Pro, Giro Tyrant, iXS Trigger X, Bell 3Qtr-Air.
-- Pair with metadata.InferHelmetCoverage / make backfill-helmet-coverage.
-- Spec filters/facets read llm_overrides || llm_specs (API change); this migration
-- still copies genuine overrides so stored llm_specs match shopper-visible values,
-- then forces known-good 3/4 families even if the first-pass audit overrode them
-- to Half shell (e.g. listing 1963933 Dropframe Pro).

-- Coverage field: ear-coverage + chin-bar decision tree. Other is back for chin-bar accessories.
UPDATE llm_extraction_field_defs
SET
  description = 'Helmet shell coverage. Choose exactly one using ear coverage and chin bar, not MTB/MIPS/Air/Trail marketing. Half shell: does NOT cover the ears (Giro Artex/Manifest/Merit/Bexley, Bell 4Forty/Falcon/Nomad/Span/Local/Racket/Super Air without R, TLD A2/A3, Leatt Trail/AllMtn, POC Kortal/Cularis/Tectal, 7 iDP M2/M5/X2/Project 21, 661 Evo AM). 3/4 shell: covers top, back, sides, AND the ears; no chin bar — Fox Dropframe / Dropframe Pro, Giro Tyrant, iXS Trigger X, Bell 3Qtr-Air. Full face: integrated or non-removable chin bar (Fox Proframe, Bell Full-9/Full-10, POC Coron, Leatt Gravity, Giro Coalition, TLD D3/D4, 7 iDP M1/Project 23, Bell Sanction 2 DLX). Convertible: complete helmet that rides full-face and half-shell (or 3/4) via removable chin bar (Bell Super DH/3R/2R, Super Air R, Giro Switchblade, MET Parachute, Bell Full-Air). Chin-bar parts sold alone = Other. Do NOT use 3/4 for marketing "extended coverage" on open-face lids.',
  values = '["Half shell", "Full face", "3/4 shell", "Convertible", "Other"]'::jsonb,
  updated_at = NOW()
WHERE field_key = 'coverage';

UPDATE llm_prompt_profiles
SET
  system_prompt = 'You are a mountain bike helmet spec extraction expert. Given a product listing, extract structured specs.

Coverage (choose exactly one; ear coverage and chin bar beat store category and MTB/MIPS/Air/Trail keywords):
- Half shell: does NOT cover the ears (open-face trail/XC/road/urban). Examples: Giro Artex/Manifest/Merit/Bexley, Bell 4Forty/Falcon/Nomad/Span/Local/Racket/Super Air (without R), TLD A2/A3, Leatt Trail/AllMtn, POC Kortal/Cularis/Tectal, 7 iDP M2/M5/X2/Project 21, 661 Evo AM. Extended occipital wrap without ear coverage is still Half shell. Do NOT infer Full face from MTB/MIPS/Air/Trail alone.
- 3/4 shell: covers top, back, sides, AND the ears; no chin bar. Known-good: Fox Dropframe / Dropframe Pro, Giro Tyrant, iXS Trigger X, Bell 3Qtr-Air. Do not use 3/4 for marketing "extended coverage" on open-face lids (4Forty, Artex, Kortal, Super Air without R).
- Full face: fixed / non-removable chin bar (Fox Proframe, Bell Full-9/Full-10, POC Coron, Leatt Gravity, Giro Coalition, TLD D3/D4, 7 iDP M1 / Project 23, Bell Sanction 2 DLX). Bell Sanction is Full face, not 3/4.
- Convertible: complete helmet designed to ride as full-face and half-shell (or 3/4) via removable chin bar (Bell Super DH/3R/2R, Super Air R, Giro Switchblade, MET Parachute, Bell Full-Air). Chin-bar replacement parts sold alone = Other.
- Other: chin bar, visor, liner, or pad kit sold without a helmet.

Intended use: return all matching disciplines as an array. Use DH not Downhill. XC = race/lightweight; BMX/skate = BMX; dirt jump/park = Dirt Jump.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.',
  updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'gear-helmets' LIMIT 1);

-- Copy admin Coverage corrections onto llm_specs so raw spec JSON matches the filter.
-- Skip known-good 3/4 families: the first-pass audit wrongly overrode some to Half shell.
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs}',
  COALESCE(sl.metadata->'llm_specs', '{}'::jsonb) || jsonb_build_object('coverage', sl.metadata->'llm_overrides'->'coverage'),
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND jsonb_typeof(sl.metadata->'llm_overrides') = 'object'
  AND sl.metadata->'llm_overrides' ? 'coverage'
  AND NULLIF(BTRIM(sl.metadata->'llm_overrides'->>'coverage'), '') IS NOT NULL
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM sl.metadata->'llm_overrides'->>'coverage'
  AND sl.product_name NOT ILIKE '%dropframe%'
  AND sl.product_name NOT ILIKE '%tyrant%'
  AND sl.product_name NOT ILIKE '%trigger x%'
  AND sl.product_name NOT ILIKE '%3qtr%';

-- Known-good 3/4 (Zack lock): ear coverage, no chin bar. Force even if a Half shell override exists.
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"3/4 shell"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND sl.product_name NOT ILIKE '%chin bar%'
  AND sl.product_name NOT ILIKE '%full face%'
  AND sl.product_name NOT ILIKE '%full-face%'
  AND (
    sl.product_name ILIKE '%dropframe%'
    OR sl.product_name ILIKE '%tyrant%'
    OR sl.product_name ILIKE '%trigger x%'
    OR sl.product_name ILIKE '%3qtr%'
    OR sl.product_name ILIKE '%3/4%'
    OR sl.product_name ILIKE '%three-quarter%'
    OR sl.product_name ILIKE '%three quarter%'
  )
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM '3/4 shell';

-- Strip first-pass Half shell overrides on known-good 3/4 so filters (override || specs) stay correct.
UPDATE store_listings sl
SET metadata = jsonb_set(
  sl.metadata,
  '{llm_overrides}',
  (sl.metadata->'llm_overrides') - 'coverage',
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND jsonb_typeof(sl.metadata->'llm_overrides') = 'object'
  AND sl.metadata->'llm_overrides' ? 'coverage'
  AND sl.metadata->'llm_overrides'->>'coverage' IS DISTINCT FROM '3/4 shell'
  AND sl.product_name NOT ILIKE '%chin bar%'
  AND sl.product_name NOT ILIKE '%full face%'
  AND sl.product_name NOT ILIKE '%full-face%'
  AND (
    sl.product_name ILIKE '%dropframe%'
    OR sl.product_name ILIKE '%tyrant%'
    OR sl.product_name ILIKE '%trigger x%'
    OR sl.product_name ILIKE '%3qtr%'
  );

-- Chin-bar accessories sold alone.
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"Other"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND sl.product_name ILIKE '%chin bar%'
  AND (sl.metadata->'llm_overrides'->>'coverage') IS NULL
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM 'Other';

-- Super Air R is convertible (removable chin bar), not 3/4.
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"Convertible"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND (sl.metadata->'llm_overrides'->>'coverage') IS NULL
  AND sl.product_name NOT ILIKE '%chin bar%'
  AND sl.product_name ILIKE '%super air r%'
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM 'Convertible';

-- Known half-shell families that 041 / the LLM tagged 3/4 or Full face (no ear coverage).
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"Half shell"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND (sl.metadata->'llm_overrides'->>'coverage') IS NULL
  AND sl.product_name NOT ILIKE '%chin bar%'
  AND sl.product_name NOT ILIKE '%full face%'
  AND sl.product_name NOT ILIKE '%full-face%'
  AND sl.product_name NOT ILIKE '%super air r%'
  AND sl.product_name NOT ILIKE '%3qtr%'
  AND sl.product_name NOT ILIKE '%trigger x%'
  AND sl.product_name NOT ILIKE '%dropframe%'
  AND sl.product_name NOT ILIKE '%tyrant%'
  AND sl.product_name NOT ILIKE '%sanction 2 dlx%'
  AND sl.product_name NOT ILIKE '%proframe%'
  AND sl.product_name NOT ILIKE '%full-9%'
  AND sl.product_name NOT ILIKE '%full-10%'
  AND sl.product_name NOT ILIKE '%coalition%'
  AND sl.product_name NOT ILIKE '%switchblade%'
  AND sl.product_name NOT ILIKE '%super dh%'
  AND sl.product_name NOT ILIKE '%super 3r%'
  AND sl.product_name NOT ILIKE '%super 2r%'
  AND sl.product_name NOT ILIKE '%full-air%'
  AND (
    sl.product_name ILIKE '%4forty%'
    OR sl.product_name ILIKE '%falcon%'
    OR sl.product_name ILIKE '%nomad%'
    OR sl.product_name ILIKE '% span%'
    OR sl.product_name ILIKE 'span %'
    OR sl.product_name ILIKE '%racket%'
    OR sl.product_name ILIKE '%artex%'
    OR sl.product_name ILIKE '%bexley%'
    OR sl.product_name ILIKE '%quarter%'
    OR sl.product_name ILIKE '%manifest%'
    OR sl.product_name ILIKE '%merit%'
    OR sl.product_name ILIKE '%agilis%'
    OR sl.product_name ILIKE '% a2 %'
    OR sl.product_name ILIKE '%a2 mips%'
    OR sl.product_name ILIKE '% a3 %'
    OR sl.product_name ILIKE '%a3 mtb%'
    OR sl.product_name ILIKE '%allmtn%'
    OR sl.product_name ILIKE '%all-mtn%'
    OR sl.product_name ILIKE '%all mtn%'
    OR sl.product_name ILIKE '%trail 3.0%'
    OR sl.product_name ILIKE '%trail 2.0%'
    OR sl.product_name ILIKE '%kortal%'
    OR sl.product_name ILIKE '%cularis%'
    OR sl.product_name ILIKE '%tectal%'
    OR sl.product_name ILIKE '%axion%'
    OR sl.product_name ILIKE '%ambush%'
    OR sl.product_name ILIKE '%project 21%'
    OR sl.product_name ILIKE '% m2 %'
    OR sl.product_name ILIKE '%m2 boa%'
    OR sl.product_name ILIKE '% m5 %'
    OR sl.product_name ILIKE '%m5 mtb%'
    OR sl.product_name ILIKE '% x2 %'
    OR sl.product_name ILIKE '%x2 mtb%'
    OR sl.product_name ILIKE '%impala%'
    OR sl.product_name ILIKE '%lupo%'
    OR sl.product_name ILIKE '%revolution%'
    OR sl.product_name ILIKE '%pisspot%'
    OR sl.product_name ILIKE '%engage%'
    OR sl.product_name ILIKE '%super air%'
    OR sl.product_name ILIKE '%air pro%'
    OR sl.product_name ILIKE '%kudo%'
    OR sl.product_name ILIKE '%kassis%'
    OR sl.product_name ILIKE '%bushwhacker%'
    OR sl.product_name ILIKE '%evo am%'
    OR sl.product_name ILIKE '%speedframe%'
    OR sl.product_name ILIKE '%mainframe%'
    OR sl.product_name ILIKE '%protec%'
    OR sl.product_name ILIKE '%urban-lite%'
    OR sl.product_name ILIKE '%urban lite%'
    OR sl.product_name ILIKE '%open face%'
    OR sl.product_name ILIKE '%open-face%'
    OR sl.product_name ILIKE '%road helmet%'
    OR sl.product_name ILIKE '%urban helmet%'
  )
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM 'Half shell';

-- Opposite-direction 3/4 → Full face (fixed chin).
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"Full face"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND (sl.metadata->'llm_overrides'->>'coverage') IS NULL
  AND sl.product_name ILIKE '%sanction 2 dlx%'
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM 'Full face';

-- Giro Coalition is a fixed-chin full face (often tagged Convertible).
UPDATE store_listings sl
SET metadata = jsonb_set(
  COALESCE(sl.metadata, '{}'::jsonb),
  '{llm_specs,coverage}',
  '"Full face"'::jsonb,
  true
)
WHERE sl.canonical_category[1] = 'Gear'
  AND sl.canonical_category[2] = 'Helmets'
  AND (sl.metadata->'llm_overrides'->>'coverage') IS NULL
  AND sl.product_name ILIKE '%coalition%'
  AND sl.metadata->'llm_specs'->>'coverage' IS DISTINCT FROM 'Full face';
