-- ZAC-241 follow-up: bike_size is inherited by all Bikes children (Road, Gravel, BMX,
-- Kids, eMTB). Keep a scalar enum (one size per listing row) and expand values so
-- road/gravel cm and BMX top-tube inches can be extracted and faceted.
-- In-stock size *sets* stay on variant chips, not in this field.
-- Idempotent: safe to re-run.

UPDATE llm_extraction_field_defs
SET
  field_type = 'enum',
  description = 'Rider/frame size of THIS listing row — not wheel size and not a size-run. Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large). Specialized S-sizing: S1–S6 when the listing uses that system. MTB/frame inches: 13–23 (including halves like 17.5, 21.5). Road/gravel traditional sizes: 47cm–64cm (store as 54cm, 58cm). BMX top-tube inches: 20–22 (store as 21.5). Null if this row is a size-run without a single size, or size is unknown. Multiple in-stock sizes belong on variant chips. Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.',
  label = 'Size',
  values = '[
    "XXS","XS","S","M","L","XL","XXL",
    "S1","S2","S3","S4","S5","S6",
    "13","14","15","15.5","16","17","17.5","18","19","19.5","20","20.5","21","21.25","21.5","21.75","22","23",
    "44cm","46cm","47cm","48cm","49cm","50cm","51cm","52cm","53cm","54cm","55cm","56cm","57cm","58cm","59cm","60cm","61cm","62cm","64cm"
  ]'::jsonb,
  filterable = true,
  extractable = true,
  updated_at = NOW()
WHERE field_key = 'bike_size';

DO $$
DECLARE
  old_rubric TEXT := E'Frame size (bike_size): the rider size of THIS listing, not wheel size.
- Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large).
- Specialized S-sizing: S1–S6 when the listing uses that system.
- Numeric frame sizes in inches (15, 17, 19, …) only when that is the stated size.
- Null if the listing is a size-run without a single size, or size is unknown.
- Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.';
  new_rubric TEXT := E'Frame size (bike_size): the rider size of THIS listing row, not wheel size. One value per row — not every in-stock size.
- Letter sizes: XXS, XS, S, M, L, XL, XXL (map Small/Medium/Large). Used across MTB, road, gravel, and many modern brands.
- Specialized S-sizing: S1–S6 when the listing uses that system.
- MTB/frame inches: 13–23 (including halves like 17.5, 21.5) only when that is the stated frame size.
- Road/gravel traditional sizes: 47cm–64cm (store as 54cm, 56cm, 58cm). Prefer cm when the listing states centimeters.
- BMX top-tube: 20–22 inch TT (store as 21.5). Never store BMX wheel size (20", 18", 16", 24" cruiser) as bike_size.
- Null if the listing is a size-run without a single size, or size is unknown. Multiple in-stock sizes belong on variant chips, not in this field.
- Never copy wheel size (29, 27.5, MX, 650b, 700c) into bike_size.';
BEGIN
  UPDATE llm_prompt_profiles
  SET
    system_prompt = replace(system_prompt, old_rubric, new_rubric),
    updated_at = NOW()
  WHERE system_prompt LIKE '%' || old_rubric || '%';

  UPDATE llm_prompt_profiles
  SET
    system_prompt = system_prompt || E'\n\n' || new_rubric,
    updated_at = NOW()
  WHERE category_id IN (
    SELECT id FROM categories
    WHERE slug IN (
      'bikes',
      'bikes-mountain',
      'bikes-frames',
      'bikes-bmx',
      'bikes-road',
      'bikes-gravel',
      'bikes-kids',
      'bikes-electric',
      'bikes-emtb'
    )
  )
    AND system_prompt NOT ILIKE '%bike_size%';
END $$;
