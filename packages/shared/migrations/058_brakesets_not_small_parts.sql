-- ZAC-272: small brake hardware was landing on Components › Brakes › Brakesets.
-- Production maps bare "brake"/"brakes"/"brakeset" → Brakesets (priority 20).
-- Store paths like "Brake Cable Parts", "MTB/Road Brake Cables", and
-- "Brake Adaptors" substring-match "brake" and beat the narrower 057 keywords
-- ("brake olive", "brake hose") because "brake cable parts" does not contain
-- "brake parts". taxonomy.Map cannot see titles, so olives named "BH59 Olive
-- & Barb" also stayed on Brakesets. Some rows already have confident
-- metadata.llm_category = Brake parts that never copied onto canonical.
--
-- This migration: (1) expand Brake parts mapping keywords, (2) tighten
-- classifier rubrics, (3) product-name + store-path backfill from Brakesets /
-- Brakes parent, (4) copy confident llm_category Brake parts onto canonical.
-- Pair with taxonomy.RefineBrakes at scrape ingest, PDP map, recategorize,
-- and LLM classify. Restart the API after apply so in-memory mappings reload.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Classifier rubrics
-- ---------------------------------------------------------------------------
UPDATE categories SET description = 'Complete brake systems — lever plus caliper (often with hose and fittings). Also complete calipers or levers sold as a unit. Does NOT include pads (use Pads), rotors (use Rotors), or small hardware sold without the complete product: cables, housing, end caps, crimps, olives, inserts, banjo bolts, pistons, bleed fittings, hoses sold alone, disc adapters, mounting/rotor bolts, lock rings, noodles, or cable hangers (use Brake parts).'
WHERE slug = 'components-brakes-brakesets';

UPDATE categories SET description = 'Small brake hardware sold without a complete brakeset: cables, housing, end caps, crimps, olives, inserts, banjo bolts, pistons, bleed fittings, hoses sold alone, disc-brake adapters, mounting/rotor bolts, lock rings, noodles, and cable hangers. Does NOT include complete brakesets, calipers, or levers (use Brakesets), brake pads (use Pads), or rotors (use Rotors). Bleed tools stay in Accessories > Tools.'
WHERE slug = 'components-brakes-parts';

UPDATE categories SET description = 'Brake systems and consumables. Use the most specific sub-category: complete Brakesets (lever+caliper, or a complete caliper/lever), Pads, or Rotors. Cables, olives, adapters, bolts, and hoses sold alone belong in Brake parts — never on Brakesets.'
WHERE slug = 'components-brakes';

-- ---------------------------------------------------------------------------
-- 2. Expand high-priority Brake parts keywords (beat bare "brake" → Brakesets)
-- ---------------------------------------------------------------------------
UPDATE category_mappings
SET
  raw_keywords = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(raw_keywords, '{}'::text[]) || ARRAY[
          'brake cable', 'brake cables', 'brake housing', 'cable parts',
          'cables & hoses', 'cables & housing',
          'brake adaptor', 'brake adapter', 'brake adaptors', 'brake adapters',
          'mount adaptor', 'mount adapter',
          'lever parts', 'lever part', 'lever hood', 'lever hoods', 'lever blade',
          'brake small parts',
          'brake noodle', 'cable hanger',
          'parts & adaptors', 'parts & adapters'
        ]::text[]
      )
    )
  ),
  updated_at = NOW()
WHERE canonical = ARRAY['Components', 'Brakes', 'Brake parts']::text[];

-- ---------------------------------------------------------------------------
-- 3. Product-name + store-path backfill from Brakesets / Brakes parent
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  brake_parts_id INT;
  brakesets_id INT;
  brakes_parent_id INT;
BEGIN
  SELECT id INTO brake_parts_id FROM categories WHERE slug = 'components-brakes-parts' LIMIT 1;
  SELECT id INTO brakesets_id FROM categories WHERE slug = 'components-brakes-brakesets' LIMIT 1;
  SELECT id INTO brakes_parent_id FROM categories WHERE slug = 'components-brakes' LIMIT 1;

  IF brake_parts_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE store_listings sl
  SET
    category_id = brake_parts_id,
    canonical_category = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
  WHERE COALESCE(sl.hidden, false) = false
    AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
    AND sl.product_name !~* '\mbrakesets?\M'
    AND sl.product_name !~* '\mbrake\s+sets?\M'
    AND (
      sl.product_name ~* '\molives?\M'
      OR sl.product_name ~* '\mbarbs?\M'
      OR sl.product_name ~* '\mcrimps?\M'
      OR sl.product_name ~* '\mend\s+caps?\M'
      OR sl.product_name ~* '\mend\s+buttons?\M'
      OR sl.product_name ~* '\mbrake\s+cables?\M'
      OR sl.product_name ~* '\mbrake\s+housings?\M'
      OR sl.product_name ~* '\mcable\s+housings?\M'
      OR sl.product_name ~* '\mcable\s+hangers?\M'
      OR sl.product_name ~* '\mcable\s+end\M'
      OR sl.product_name ~* '\mcable\s+anchors?\M'
      OR sl.product_name ~* '\mbrake\s+noodles?\M'
      OR sl.product_name ~* '\m(?:disc\s+)?brake\s+adapt[oe]rs?\M'
      OR sl.product_name ~* '\mmount\s+adapt[oe]rs?\M'
      OR sl.product_name ~* '\mmounting\s+bolts?\M'
      OR sl.product_name ~* '\mcaliper\s+fixing\s+bolts?\M'
      OR sl.product_name ~* '\mlever\s+axles?\M'
      OR sl.product_name ~* '\mlever\s+parts?\M'
      OR sl.product_name ~* '\mlever\s+hoods?\M'
      OR sl.product_name ~* '\mlever\s+blades?\M'
      OR sl.product_name ~* '\mbleed\s+screws?\M'
      OR sl.product_name ~* '\mrotor\s+bolts?\M'
      OR sl.product_name ~* '\mlock\s+rings?\M'
      OR sl.product_name ~* '\mbanjo\s+bolts?\M'
      OR sl.product_name ~* '\mconnecting\s+inserts?\M'
      OR sl.product_name ~* '\mbrake\s+hoses?\M'
      OR sl.product_name ~* '\mhydraulic\s+hoses?\M'
      OR sl.product_name ~* '\mcaliper\s+pistons?\M'
      OR sl.product_name ~* '\mbrake\s+pistons?\M'
      OR sl.category_path::text ILIKE '%brake cable%'
      OR sl.category_path::text ILIKE '%brake housing%'
      OR sl.category_path::text ILIKE '%cable parts%'
      OR sl.category_path::text ILIKE '%cables & hose%'
      OR sl.category_path::text ILIKE '%cables & housing%'
      OR sl.category_path::text ILIKE '%brake adaptor%'
      OR sl.category_path::text ILIKE '%brake adapter%'
      OR sl.category_path::text ILIKE '%mount adaptor%'
      OR sl.category_path::text ILIKE '%mount adapter%'
      OR sl.category_path::text ILIKE '%lever part%'
      OR sl.category_path::text ILIKE '%brake small part%'
      OR sl.category_path::text ILIKE '%brake noodle%'
      OR sl.category_path::text ILIKE '%cable hanger%'
      OR sl.category_path::text ILIKE '%parts & adaptor%'
      OR sl.category_path::text ILIKE '%parts & adapter%'
    )
    AND (
      sl.category_id IS NULL
      OR sl.category_id IN (brakesets_id, brakes_parent_id)
      OR sl.canonical_category = ARRAY['Components', 'Brakes', 'Brakesets']::text[]
      OR sl.canonical_category = ARRAY['Components', 'Brakes']::text[]
    );

  -- Pad titles that landed on Brakesets via bare "brake" in "Brakes & Parts".
  IF (SELECT id FROM categories WHERE slug = 'components-brakes-pads' LIMIT 1) IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = (SELECT id FROM categories WHERE slug = 'components-brakes-pads' LIMIT 1),
      canonical_category = ARRAY['Components', 'Brakes', 'Pads']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND sl.product_name ~* '\m(?:disc\s+)?brake\s+pads?\M'
      AND sl.product_name !~* '\mbrakesets?\M'
      AND sl.product_name !~* '\mbrake\s+sets?\M'
      AND (
        sl.category_id IN (brakesets_id, brakes_parent_id)
        OR sl.canonical_category = ARRAY['Components', 'Brakes', 'Brakesets']::text[]
        OR sl.canonical_category = ARRAY['Components', 'Brakes']::text[]
      );
  END IF;

  -- Copy confident LLM Brake parts onto canonical when still stuck on Brakesets.
  UPDATE store_listings sl
  SET
    category_id = brake_parts_id,
    canonical_category = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
  WHERE COALESCE(sl.hidden, false) = false
    AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
    AND (
      sl.category_id IN (brakesets_id, brakes_parent_id)
      OR sl.canonical_category = ARRAY['Components', 'Brakes', 'Brakesets']::text[]
      OR sl.canonical_category = ARRAY['Components', 'Brakes']::text[]
    )
    AND sl.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
    AND (sl.metadata->'llm_category'->>'confidence')::float >= 0.5
    AND ARRAY(SELECT jsonb_array_elements_text(sl.metadata->'llm_category'->'canonical_category'))
        = ARRAY['Components', 'Brakes', 'Brake parts']::text[];
END $$;

-- ---------------------------------------------------------------------------
-- 4. Classifier system prompt: cables/adapters are Brake parts, not Brakesets
-- ---------------------------------------------------------------------------
UPDATE llm_category_classifier
SET
  system_prompt = system_prompt || E'\n\nBrakesets is only a complete lever+caliper system (or a complete caliper or lever sold as a unit). Brake cables, housing, end caps, crimps, olives, inserts, disc adapters, mounting/rotor bolts, lock rings, noodles, cable hangers, bleed screws, and hoses sold alone MUST be Components > Brakes > Brake parts — never Brakesets, even when the store breadcrumb says Brake or Disc Brake.',
  updated_at = NOW()
WHERE system_prompt NOT ILIKE '%Brakesets is only a complete lever+caliper system%';
