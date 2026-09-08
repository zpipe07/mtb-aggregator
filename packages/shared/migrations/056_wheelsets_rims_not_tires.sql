-- ZAC-263: wheelsets and rims were landing on Components › Wheels/Tires › Tires.
-- Store breadcrumbs (and "Tire Set" in Competitive Cyclist wheelset+tire bundle
-- titles) pulled the LLM sibling classifier to Tires even when reasoning named
-- a rim or wheelset. Path-only taxonomy.Map cannot see titles and seed mappings
-- do not emit the Tires leaf, so recategorize could not unstick those rows.
--
-- This migration: (1) classifier rubrics so Tires excludes wheelsets/rims/bundles,
-- (2) product-name backfill from Tires / Wheels/Tires parent, (3) copy confident
-- llm_category Complete wheels / Rims onto canonical when still stuck on Tires.
-- Pair with taxonomy.RefineWheelsTires at scrape ingest, PDP map, recategorize,
-- and LLM classify. Restart the API after apply. Idempotent.

UPDATE categories SET description = 'Wheels and tires for bikes. Use the most specific sub-category: complete wheelsets and single built wheels in Complete Wheels (including wheelset+tire bundles); individual rubber tires in Tires; tubeless valves, tape, sealant, and inserts in Tubeless; bare rims in Rims; etc. Do not put a wheelset on Tires because the title or store path also says Tire / Tire Set.'
WHERE slug = 'components-wheels-tires';

UPDATE categories SET description = 'Individual rubber bike tires only — tubeless-ready, tubed, folding, and wire-bead. Does NOT include complete wheelsets, single built wheels, or wheelset+tire bundles (use Complete wheels; "Tire Set" in a wheelset title is not Tires). Does NOT include bare rims (use Rims), tubes (use Tubes), or tubeless valves/tape/sealant/inserts (use Tubeless).'
WHERE slug = 'components-wheels-tires-tires';

UPDATE categories SET description = 'Built wheelsets and single complete wheels (front or rear), including wheelset+tire bundles. Prefer this leaf when the title contains Wheelset, Wheel, or Complete wheel even if the store path or title also says Tire / Tire Set. Does NOT include rubber tires sold alone (use Tires), bare rims (use Rims), hubs, or spokes.'
WHERE slug = 'components-wheels-tires-complete-wheels';

UPDATE categories SET description = 'Bare rim hoops only — not a built wheel. Does NOT include complete wheelsets or single built wheels (use Complete wheels), rim tape or tubeless tape (use Tubeless), or rubber tires (use Tires).'
WHERE slug = 'components-wheels-tires-rims';

DO $$
DECLARE
  complete_id INT;
  rims_id INT;
  tires_id INT;
  parent_id INT;
BEGIN
  SELECT id INTO complete_id FROM categories WHERE slug = 'components-wheels-tires-complete-wheels' LIMIT 1;
  SELECT id INTO rims_id FROM categories WHERE slug = 'components-wheels-tires-rims' LIMIT 1;
  SELECT id INTO tires_id FROM categories WHERE slug = 'components-wheels-tires-tires' LIMIT 1;
  SELECT id INTO parent_id FROM categories WHERE slug = 'components-wheels-tires' LIMIT 1;

  IF complete_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = complete_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Complete wheels']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ~* '\mwheel\s*sets?\M'
        OR sl.product_name ~* '\mcomplete\s+wheels?\M'
        OR (
          sl.product_name ~* '\mwheels?\M'
          AND sl.product_name !~* '\mfreewheels?\M'
          AND sl.product_name !~* '\mflywheels?\M'
          AND sl.product_name !~* '\mtraining\s+wheels?\M'
          AND sl.product_name !~* '\mwheel\s*bags?\M'
          AND sl.product_name !~* '\mwheel\s*covers?\M'
          AND sl.product_name !~* '\mwheel\s*builders?\M'
          AND sl.product_name !~* '\mwheel\s+building\M'
          AND sl.product_name !~* '\mwheel\s*tru'
          AND sl.product_name !~* '\mwheel\s+magnets?\M'
          AND sl.product_name !~* '\mwheel\s+sensors?\M'
          AND sl.product_name !~* '\mcaster\s+wheels?\M'
          AND sl.product_name !~* '\mwheel\s*hubs?\M'
          AND sl.product_name !~* '\mhubs?\M'
          AND sl.product_name !~* '\mspokes?\M'
          AND sl.product_name !~* '\mnipples?\M'
        )
      )
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (tires_id, parent_id)
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires', 'Tires']::text[]
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires']::text[]
      );
  END IF;

  IF rims_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = rims_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Rims']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND sl.product_name ~* '\mrims?\M'
      AND sl.product_name !~* '\mrim\s*tapes?\M'
      AND sl.product_name !~* '\mrim\s*strips?\M'
      AND sl.product_name !~* '\mtire\s*tapes?\M'
      AND sl.product_name !~* '\mtyre\s*tapes?\M'
      AND sl.product_name !~* '\mrim\s+brakes?\M'
      AND sl.product_name !~* '\mrim\s+pads?\M'
      AND sl.product_name !~* '\mwheel\s*sets?\M'
      AND sl.product_name !~* '\mcomplete\s+wheels?\M'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (tires_id, parent_id)
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires', 'Tires']::text[]
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires']::text[]
      );
  END IF;

  -- Copy confident LLM Complete wheels / Rims onto canonical when still on Tires
  -- (title lacked Wheelset/Rim, but structured llm_category was already correct).
  IF complete_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = complete_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Complete wheels']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.category_id = tires_id
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires', 'Tires']::text[]
      )
      AND sl.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
      AND (sl.metadata->'llm_category'->>'confidence')::float >= 0.5
      AND ARRAY(SELECT jsonb_array_elements_text(sl.metadata->'llm_category'->'canonical_category'))
          = ARRAY['Components', 'Wheels/Tires', 'Complete wheels']::text[];
  END IF;

  IF rims_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = rims_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Rims']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.category_id = tires_id
        OR sl.canonical_category = ARRAY['Components', 'Wheels/Tires', 'Tires']::text[]
      )
      AND sl.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
      AND (sl.metadata->'llm_category'->>'confidence')::float >= 0.5
      AND ARRAY(SELECT jsonb_array_elements_text(sl.metadata->'llm_category'->'canonical_category'))
          = ARRAY['Components', 'Wheels/Tires', 'Rims']::text[];
  END IF;
END $$;
