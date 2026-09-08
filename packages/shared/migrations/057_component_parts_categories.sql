-- ZAC-271: first-wave component "{Parent} parts" shelves (Helmet parts pattern).
-- Existing Components › * › Parts leaves were named bare "Parts" and visible in
-- the mega-menu, while fork/shock/handlebar keywords dumped small hardware onto
-- the complete-product leaf. This migration:
--   1. Renames those leaves to "{Parent} parts" and sets hide_from_nav
--   2. Tightens classifier rubrics on complete-product leaves + parts catch-alls
--   3. Adds high-priority mappings so store paths like "Fork Seals" beat bare "fork"
--   4. Product-name backfill from the main leaves
--   5. Appends a parts-vs-complete rule to the LLM classifier system prompt
-- Idempotent. Restart the API after apply so in-memory mappings reload, then
-- make backfill-canonical-categories.

-- ---------------------------------------------------------------------------
-- 1. Rename + hide existing Parts leaves (Helmet style: "{Parent} parts")
-- ---------------------------------------------------------------------------
UPDATE categories
SET
  name = 'Drivetrain parts',
  hide_from_nav = true,
  description = 'Small drivetrain hardware sold without a complete component: chains, cable housing, jockey wheels, derailleur hangers, chain guides, chainring bolts, and similar. Does NOT include complete cassettes, derailleurs, cranks, chainrings, shifters, pedals, or bottom brackets (use those leaves). Does NOT include tools (use Accessories > Tools).',
  updated_at = NOW()
WHERE slug = 'components-drivetrain-parts';

UPDATE categories
SET
  name = 'Brake parts',
  hide_from_nav = true,
  description = 'Small brake hardware sold without a complete brakeset: olives, inserts, banjo bolts, pistons, bleed fittings, and hoses sold alone. Does NOT include complete brakesets (use Brakesets), brake pads (use Pads), or rotors (use Rotors). Bleed tools stay in Accessories > Tools.',
  updated_at = NOW()
WHERE slug = 'components-brakes-parts';

UPDATE categories
SET
  name = 'Suspension parts',
  hide_from_nav = true,
  description = 'Small suspension hardware sold without a complete fork or shock: seal kits, dust wipers, volume spacers, bushings, foam rings, and rebuild kits. Does NOT include complete forks (use Forks) or complete rear shocks (use Shocks). Does NOT include shock/fork pumps (use Accessories > Pumps).',
  updated_at = NOW()
WHERE slug = 'components-suspension-parts';

UPDATE categories
SET
  name = 'Wheels/Tires parts',
  hide_from_nav = true,
  description = 'Wheel and tire hardware: spoke nipples, loose spokes, rim strips, thru-axles, and other miscellany. Does NOT include complete wheelsets (use Complete wheels), rubber tires (use Tires), bare rims (use Rims), hubs (use Hubs), tubes (use Tubes), or tubeless valves/tape/sealant/inserts (use Tubeless).',
  updated_at = NOW()
WHERE slug = 'components-wheels-tires-parts';

UPDATE categories
SET
  name = 'Cockpit parts',
  hide_from_nav = true,
  description = 'Small cockpit hardware sold without the complete component: bar ends, bar plugs, stem caps, headset spacers, stem faceplates/bolts sold alone, dropper remote levers sold alone, and similar. Does NOT include complete handlebars, stems, seatposts, grips, saddles, or headsets (use those leaves). Headset tools stay in Accessories > Tools.',
  updated_at = NOW()
WHERE slug = 'components-cockpit-parts';

-- ---------------------------------------------------------------------------
-- 2. Classifier rubrics: complete-product leaves exclude spare parts
-- ---------------------------------------------------------------------------
UPDATE categories SET description = 'Drivetrain components for transmitting pedal power. Use the most specific sub-category: Pedals, Cranks, Chainrings, Derailleurs, Cassettes, Shifters, Bottom Brackets. Small hardware (hangers, jockey wheels, housing, chain guides) belongs in Drivetrain parts, not this parent and not a complete-product leaf.'
WHERE slug = 'components-drivetrain';

UPDATE categories SET description = 'Cranksets and individual crank arms. Does NOT include chainrings (use Chainrings), bottom brackets (use Bottom Brackets), or chainring bolts / crank bolts sold alone (use Drivetrain parts).'
WHERE slug = 'components-drivetrain-cranks';

UPDATE categories SET description = 'Complete cassettes and freehub cogs. Does NOT include lockrings, spacers, or freehub bodies sold alone (use Drivetrain parts).'
WHERE slug = 'components-drivetrain-cassettes';

UPDATE categories SET description = 'Complete front and rear derailleurs. Does NOT include derailleur hangers, jockey wheels, or clutch parts sold alone (use Drivetrain parts).'
WHERE slug = 'components-drivetrain-derailleurs';

UPDATE categories SET description = 'Chainrings and chainring sets. Does NOT include chainring bolts sold alone (use Drivetrain parts) or crank arms (use Cranks).'
WHERE slug = 'components-drivetrain-chainrings';

UPDATE categories SET description = 'Complete shifters and dropper-post shifter pods that are a shifter. Does NOT include shift cables, housing, or spare pods sold as hardware (use Drivetrain parts).'
WHERE slug = 'components-drivetrain-shifters';

UPDATE categories SET description = 'Complete bicycle pedals (clipless or flat). Does NOT include replacement pins, traction pads, or axle kits sold alone (use Drivetrain parts).'
WHERE slug = 'components-drivetrain-pedals';

UPDATE categories SET description = 'Brake systems and consumables. Use the most specific sub-category: complete Brakesets, Pads, or Rotors. Olives, inserts, pistons, and hoses sold alone belong in Brake parts.'
WHERE slug = 'components-brakes';

UPDATE categories SET description = 'Complete brake systems — lever plus caliper (often with hose and fittings). Does NOT include pads (use Pads), rotors (use Rotors), or olives/inserts/hoses/pistons sold alone (use Brake parts).'
WHERE slug = 'components-brakes-brakesets';

UPDATE categories SET description = 'Brake pads and pad sets for disc or rim brakes. Does NOT include complete brakesets (use Brakesets) or caliper pistons/olives (use Brake parts). NOT helmet pad kits (use Helmet parts) or body armor (use Protection).'
WHERE slug = 'components-brakes-pads';

UPDATE categories SET description = 'Brake rotors / discs. Does NOT include rotor bolts sold alone (use Brake parts) or complete brakesets (use Brakesets).'
WHERE slug = 'components-brakes-rotors';

UPDATE categories SET description = 'Suspension forks and rear shocks. Use Forks or Shocks for the complete unit. Seal kits, dust wipers, volume spacers, bushings, and rebuild kits belong in Suspension parts — never on Forks or Shocks. Shock/fork pumps belong in Accessories > Pumps.'
WHERE slug = 'components-suspension';

UPDATE categories SET description = 'Complete suspension forks only (Fox, RockShox, Öhlins, etc.). Does NOT include seal kits, dust wipers, volume spacers, bushings, foam rings, air springs sold alone, or rebuild kits (use Suspension parts). Does NOT include fork pumps (use Accessories > Pumps).'
WHERE slug = 'components-suspension-forks';

UPDATE categories SET description = 'Complete rear shocks only. Does NOT include seal kits, air cans sold alone, volume spacers, bushings, or rebuild kits (use Suspension parts). Does NOT include shock pumps (use Accessories > Pumps).'
WHERE slug = 'components-suspension-shocks';

UPDATE categories SET description = 'Wheels and tires for bikes. Use the most specific sub-category: complete wheelsets and single built wheels in Complete Wheels (including wheelset+tire bundles); individual rubber tires in Tires; tubeless valves, tape, sealant, and inserts in Tubeless; bare rims in Rims; hubs in Hubs. Loose spokes, nipples, rim strips, and thru-axles belong in Wheels/Tires parts. Do not put a wheelset on Tires because the title or store path also says Tire / Tire Set.'
WHERE slug = 'components-wheels-tires';

UPDATE categories SET description = 'Built wheelsets and single complete wheels (front or rear), including wheelset+tire bundles. Prefer this leaf when the title contains Wheelset, Wheel, or Complete wheel even if the store path or title also says Tire / Tire Set. Does NOT include rubber tires sold alone (use Tires), bare rims (use Rims), hubs (use Hubs), or loose spokes/nipples/thru-axles (use Wheels/Tires parts).'
WHERE slug = 'components-wheels-tires-complete-wheels';

UPDATE categories SET description = 'Complete bicycle hubs (front or rear). Does NOT include loose spokes, nipples, or thru-axles (use Wheels/Tires parts) or a built wheel (use Complete wheels).'
WHERE slug = 'components-wheels-tires-hubs';

UPDATE categories SET description = 'Handlebar area and rider interface components. Use the most specific leaf: Handlebars, Stems, Seatposts, Grips, Saddles, Headsets. Small hardware (bar ends, plugs, spacers, stem caps, dropper remotes sold alone) belongs in Cockpit parts. Does NOT include suspension forks (use Suspension > Forks) or pedals (use Drivetrain > Pedals).'
WHERE slug = 'components-cockpit';

UPDATE categories SET description = 'Complete handlebars only. Does NOT include bar ends, bar plugs, or bar tape sold alone (use Cockpit parts or Grips).'
WHERE slug = 'components-cockpit-handlebars';

UPDATE categories SET description = 'Complete stems only. Does NOT include stem caps, spacers, faceplates, or bolts sold alone (use Cockpit parts).'
WHERE slug = 'components-cockpit-stems';

UPDATE categories SET description = 'Complete seatposts including dropper posts. Does NOT include dropper remotes, seals, or bushings sold alone (use Cockpit parts).'
WHERE slug = 'components-cockpit-seatposts';

UPDATE categories SET description = 'Complete grips and handlebar tape. Does NOT include bar plugs sold alone (use Cockpit parts).'
WHERE slug = 'components-cockpit-grips';

UPDATE categories SET description = 'Complete saddles. Does NOT include saddle bags (use Accessories > Bags) or rail clamps / hardware sold alone (use Cockpit parts).'
WHERE slug = 'components-cockpit-saddles';

UPDATE categories SET description = 'Complete headset assemblies and bearing cups for the head tube — threadless, integrated (IS), and external (EC/ZS) types. Does NOT include headset spacers, stem caps, top caps, or headset tools (use Cockpit parts or Accessories > Tools).'
WHERE slug = 'components-cockpit-headsets';

UPDATE categories SET description = 'Complete bottom bracket assemblies and bearing cups for connecting cranks to the frame. Includes threaded (BSA), press-fit (PF30, BB86/92), and T47 interfaces. Does NOT include bottom bracket tools, bearing presses, or wrenches (use Accessories > Tools) or cranksets (use Cranks).'
WHERE slug = 'components-drivetrain-bottom-brackets';

-- Helmets: keep ZAC-246 sibling split; tighten so visors/liners/pads cannot stay on Helmets.
UPDATE categories SET description = 'Complete bike helmets only — half-shell XC/trail/road, 3/4 shell, full-face MTB, and convertible dual-function helmets. A product that is only a visor, peak, liner, cheek pad, pad kit, fit/retention system, chin bar, screw kit, or helmet cover (sold without a helmet) MUST be Helmet parts, never Helmets.'
WHERE slug = 'gear-helmets';

UPDATE categories SET description = 'Replacement helmet parts and accessories sold without a helmet: visors/peaks, cheek pads, comfort/inner liners, pad kits, fit systems, retention systems, chin bars sold alone, screw kits, and helmet covers. Does NOT include complete helmets (use Helmets), helmet-mounted lights (use Accessories > Lights), or body armor / knee pads (use Protection).'
WHERE slug = 'gear-helmet-parts';

-- ---------------------------------------------------------------------------
-- 3. Rewrite stored name paths after the Parts → "{Parent} parts" rename
-- ---------------------------------------------------------------------------
UPDATE store_listings
SET canonical_category = ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Drivetrain', 'Parts']::text[];

UPDATE store_listings
SET canonical_category = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Brakes', 'Parts']::text[];

UPDATE store_listings
SET canonical_category = ARRAY['Components', 'Suspension', 'Suspension parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Suspension', 'Parts']::text[];

UPDATE store_listings
SET canonical_category = ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Wheels/Tires', 'Parts']::text[];

UPDATE store_listings
SET canonical_category = ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Cockpit', 'Parts']::text[];

UPDATE store_listings
SET metadata = jsonb_set(metadata, '{llm_category,canonical_category}', '["Components","Drivetrain","Drivetrain parts"]'::jsonb)
WHERE metadata->'llm_category'->'canonical_category' = '["Components","Drivetrain","Parts"]'::jsonb;

UPDATE store_listings
SET metadata = jsonb_set(metadata, '{llm_category,canonical_category}', '["Components","Brakes","Brake parts"]'::jsonb)
WHERE metadata->'llm_category'->'canonical_category' = '["Components","Brakes","Parts"]'::jsonb;

UPDATE store_listings
SET metadata = jsonb_set(metadata, '{llm_category,canonical_category}', '["Components","Suspension","Suspension parts"]'::jsonb)
WHERE metadata->'llm_category'->'canonical_category' = '["Components","Suspension","Parts"]'::jsonb;

UPDATE store_listings
SET metadata = jsonb_set(metadata, '{llm_category,canonical_category}', '["Components","Wheels/Tires","Wheels/Tires parts"]'::jsonb)
WHERE metadata->'llm_category'->'canonical_category' = '["Components","Wheels/Tires","Parts"]'::jsonb;

UPDATE store_listings
SET metadata = jsonb_set(metadata, '{llm_category,canonical_category}', '["Components","Cockpit","Cockpit parts"]'::jsonb)
WHERE metadata->'llm_category'->'canonical_category' = '["Components","Cockpit","Parts"]'::jsonb;

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[]
WHERE canonical = ARRAY['Components', 'Drivetrain', 'Parts']::text[];

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
WHERE canonical = ARRAY['Components', 'Brakes', 'Parts']::text[];

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Suspension', 'Suspension parts']::text[]
WHERE canonical = ARRAY['Components', 'Suspension', 'Parts']::text[];

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[]
WHERE canonical = ARRAY['Components', 'Wheels/Tires', 'Parts']::text[];

UPDATE category_mappings
SET canonical = ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[]
WHERE canonical = ARRAY['Components', 'Cockpit', 'Parts']::text[];

UPDATE llm_prompt_profiles
SET canonical_category = ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Drivetrain', 'Parts']::text[];

UPDATE llm_prompt_profiles
SET canonical_category = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Brakes', 'Parts']::text[];

UPDATE llm_prompt_profiles
SET canonical_category = ARRAY['Components', 'Suspension', 'Suspension parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Suspension', 'Parts']::text[];

UPDATE llm_prompt_profiles
SET canonical_category = ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Wheels/Tires', 'Parts']::text[];

UPDATE llm_prompt_profiles
SET canonical_category = ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[]
WHERE canonical_category = ARRAY['Components', 'Cockpit', 'Parts']::text[];

-- ---------------------------------------------------------------------------
-- 4. Extra helmet-part keywords on the existing 1990 row (ZAC-246 follow-up)
-- ---------------------------------------------------------------------------
UPDATE category_mappings
SET
  raw_keywords = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(raw_keywords, '{}'::text[]) || ARRAY[
          'helmet peak', 'helmet peaks', 'helmet cover', 'helmet covers',
          'helmet screw', 'helmet screws', 'helmet fit kit', 'helmet fit system',
          'retention system'
        ]::text[]
      )
    )
  ),
  updated_at = NOW()
WHERE canonical = ARRAY['Gear', 'Helmet parts']::text[];

-- ---------------------------------------------------------------------------
-- 5. High-priority small-hardware mappings (beat bare fork/shock/handlebar)
-- Priority 1991 so they run before 1990 complete-product rows (headset, pumps).
-- Do not use bare fork/shock/kit/spoke — those trap complete products.
-- ---------------------------------------------------------------------------
INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'fork parts', 'fork part', 'fork kit', 'fork kits',
  'fork seal', 'fork seals', 'fork bushing', 'fork bushings',
  'dust wiper', 'dust wipers', 'volume spacer', 'volume spacers',
  'shock parts', 'shock part', 'shock kit', 'shock kits',
  'shock seal', 'shock seals', 'shock bushing', 'shock bushings',
  'suspension parts', 'suspension part', 'seal kit', 'seal kits',
  'lower leg kit'
]::text[],
       ARRAY['Components', 'Suspension', 'Suspension parts']::text[],
       1991,
       (SELECT id FROM categories WHERE slug = 'components-suspension-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-suspension-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1991
      AND canonical = ARRAY['Components', 'Suspension', 'Suspension parts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'brake parts', 'brake part', 'brake hardware',
  'brake olive', 'brake olives', 'olive and insert', 'olives and inserts',
  'banjo bolt', 'brake piston', 'brake pistons', 'caliper piston',
  'brake hose', 'brake hoses', 'hydraulic hose'
]::text[],
       ARRAY['Components', 'Brakes', 'Brake parts']::text[],
       1991,
       (SELECT id FROM categories WHERE slug = 'components-brakes-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-brakes-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1991
      AND canonical = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'cockpit parts', 'bar end', 'bar ends', 'barend', 'barends',
  'bar plug', 'bar plugs', 'barplug',
  'stem cap', 'stem caps', 'stemcap', 'top cap', 'top caps',
  'headset spacer', 'headset spacers',
  'dropper remote', 'dropper remotes', 'dropper lever'
]::text[],
       ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[],
       1991,
       (SELECT id FROM categories WHERE slug = 'components-cockpit-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-cockpit-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1991
      AND canonical = ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'drivetrain parts', 'derailleur hanger', 'derailleur hangers',
  'jockey wheel', 'jockey wheels', 'pulley wheel', 'pulley wheels',
  'chain guide', 'chain guides', 'chainguide',
  'cable housing', 'shift cable', 'shift cables',
  'chainring bolt', 'chainring bolts'
]::text[],
       ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[],
       1991,
       (SELECT id FROM categories WHERE slug = 'components-drivetrain-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-drivetrain-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1991
      AND canonical = ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[]
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
  'spoke nipple', 'spoke nipples', 'loose spoke', 'loose spokes',
  'rim strip', 'rim strips',
  'thru-axle', 'thru axle', 'through axle', 'through-axle'
]::text[],
       ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[],
       1991,
       (SELECT id FROM categories WHERE slug = 'components-wheels-tires-parts' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'components-wheels-tires-parts')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE priority = 1991
      AND canonical = ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[]
  );

-- ---------------------------------------------------------------------------
-- 6. Product-name backfill from complete-product leaves → parts catch-alls
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  susp_parts_id INT;
  brake_parts_id INT;
  cockpit_parts_id INT;
  drive_parts_id INT;
  wheel_parts_id INT;
  helmet_parts_id INT;
BEGIN
  SELECT id INTO susp_parts_id FROM categories WHERE slug = 'components-suspension-parts' LIMIT 1;
  SELECT id INTO brake_parts_id FROM categories WHERE slug = 'components-brakes-parts' LIMIT 1;
  SELECT id INTO cockpit_parts_id FROM categories WHERE slug = 'components-cockpit-parts' LIMIT 1;
  SELECT id INTO drive_parts_id FROM categories WHERE slug = 'components-drivetrain-parts' LIMIT 1;
  SELECT id INTO wheel_parts_id FROM categories WHERE slug = 'components-wheels-tires-parts' LIMIT 1;
  SELECT id INTO helmet_parts_id FROM categories WHERE slug = 'gear-helmet-parts' LIMIT 1;

  IF susp_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = susp_parts_id,
      canonical_category = ARRAY['Components', 'Suspension', 'Suspension parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%fork seal%'
        OR sl.product_name ILIKE '%fork kit%'
        OR sl.product_name ILIKE '%fork parts%'
        OR sl.product_name ILIKE '%dust wiper%'
        OR sl.product_name ILIKE '%volume spacer%'
        OR sl.product_name ILIKE '%shock seal%'
        OR sl.product_name ILIKE '%shock kit%'
        OR sl.product_name ILIKE '%shock parts%'
        OR sl.product_name ILIKE '%seal kit%'
        OR sl.product_name ILIKE '%rebuild kit%'
        OR sl.product_name ILIKE '%lower leg kit%'
        OR sl.product_name ILIKE '%foam ring%'
      )
      AND sl.product_name NOT ILIKE '%pump%'
      AND sl.product_name NOT ILIKE '%forklift%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-suspension-forks',
            'components-suspension-shocks',
            'components-suspension',
            'components'
          )
        )
      );
  END IF;

  IF brake_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = brake_parts_id,
      canonical_category = ARRAY['Components', 'Brakes', 'Brake parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%brake olive%'
        OR sl.product_name ILIKE '%olive and insert%'
        OR sl.product_name ILIKE '%olives and inserts%'
        OR sl.product_name ILIKE '%banjo bolt%'
        OR sl.product_name ILIKE '%brake piston%'
        OR sl.product_name ILIKE '%caliper piston%'
        OR sl.product_name ILIKE '%brake hose%'
        OR sl.product_name ILIKE '%hydraulic hose%'
      )
      AND sl.product_name NOT ILIKE '%brakeset%'
      AND sl.product_name NOT ILIKE '%brake set%'
      AND sl.product_name NOT ILIKE '%lever%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-brakes',
            'components-brakes-brakesets',
            'components'
          )
        )
      );
  END IF;

  IF cockpit_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = cockpit_parts_id,
      canonical_category = ARRAY['Components', 'Cockpit', 'Cockpit parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%bar end%'
        OR sl.product_name ILIKE '%barend%'
        OR sl.product_name ILIKE '%bar plug%'
        OR sl.product_name ILIKE '%stem cap%'
        OR sl.product_name ILIKE '%stemcap%'
        OR sl.product_name ILIKE '%headset spacer%'
        OR sl.product_name ILIKE '%dropper remote%'
        OR sl.product_name ILIKE '%dropper lever%'
      )
      AND sl.product_name NOT ILIKE '%handlebar%'
      AND sl.product_name NOT ILIKE '%handle bar%'
      AND sl.product_name NOT ILIKE '%seatpost%'
      AND sl.product_name NOT ILIKE '%seat post%'
      AND sl.product_name NOT ILIKE '%headset tool%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-cockpit',
            'components-cockpit-handlebars',
            'components-cockpit-stems',
            'components-cockpit-seatposts',
            'components-cockpit-grips',
            'components-cockpit-saddles',
            'components-cockpit-headsets',
            'components'
          )
        )
      );
  END IF;

  IF drive_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = drive_parts_id,
      canonical_category = ARRAY['Components', 'Drivetrain', 'Drivetrain parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%derailleur hanger%'
        OR sl.product_name ILIKE '%jockey wheel%'
        OR sl.product_name ILIKE '%pulley wheel%'
        OR sl.product_name ILIKE '%chain guide%'
        OR sl.product_name ILIKE '%chainguide%'
        OR sl.product_name ILIKE '%cable housing%'
        OR sl.product_name ILIKE '%shift cable%'
        OR sl.product_name ILIKE '%chainring bolt%'
      )
      AND sl.product_name NOT ILIKE '%tool%'
      AND NOT (
        sl.product_name ILIKE '%derailleur%'
        AND sl.product_name NOT ILIKE '%hanger%'
      )
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-drivetrain',
            'components-drivetrain-derailleurs',
            'components-drivetrain-cassettes',
            'components-drivetrain-chainrings',
            'components-drivetrain-cranks',
            'components-drivetrain-shifters',
            'components-drivetrain-pedals',
            'components'
          )
        )
      );
  END IF;

  IF wheel_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = wheel_parts_id,
      canonical_category = ARRAY['Components', 'Wheels/Tires', 'Wheels/Tires parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%spoke nipple%'
        OR sl.product_name ILIKE '%loose spoke%'
        OR sl.product_name ILIKE '%rim strip%'
        OR sl.product_name ILIKE '%thru-axle%'
        OR sl.product_name ILIKE '%thru axle%'
        OR sl.product_name ILIKE '%through axle%'
      )
      AND sl.product_name NOT ILIKE '%wheelset%'
      AND sl.product_name NOT ILIKE '%hub%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN (
            'components-wheels-tires',
            'components-wheels-tires-complete-wheels',
            'components-wheels-tires-tires',
            'components-wheels-tires-rims',
            'components-wheels-tires-hubs',
            'components'
          )
        )
      );
  END IF;

  -- Extra helmet spare-part titles 052 could miss (peak / cover / pad kit).
  IF helmet_parts_id IS NOT NULL THEN
    UPDATE store_listings sl
    SET
      category_id = helmet_parts_id,
      canonical_category = ARRAY['Gear', 'Helmet parts']::text[]
    WHERE COALESCE(sl.hidden, false) = false
      AND COALESCE((sl.metadata->>'manual_category_override')::boolean, false) = false
      AND (
        sl.product_name ILIKE '%helmet peak%'
        OR sl.product_name ILIKE '%helmet cover%'
        OR sl.product_name ILIKE '%helmet screw%'
        OR (
          sl.product_name ILIKE '%pad kit%'
          AND sl.product_name ILIKE '%helmet%'
        )
      )
      AND sl.product_name NOT ILIKE '%with visor%'
      AND sl.product_name NOT ILIKE '%helmet light%'
      AND (
        sl.category_id IS NULL
        OR sl.category_id IN (
          SELECT id FROM categories
          WHERE slug IN ('gear-helmets', 'gear', 'accessories')
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Classifier system prompt: parts vs complete product
-- ---------------------------------------------------------------------------
UPDATE llm_category_classifier
SET
  system_prompt = system_prompt || E'\n\nReplacement parts and small hardware sold without the complete product belong in the matching parts leaf, not the complete-product category. Examples: visors, peaks, liners, cheek pads, and pad kits → Gear > Helmet parts; fork seals, dust wipers, volume spacers, and rebuild kits → Components > Suspension > Suspension parts; olives, inserts, pistons, and hoses sold alone → Components > Brakes > Brake parts; bar ends, bar plugs, stem caps, headset spacers, and dropper remotes sold alone → Components > Cockpit > Cockpit parts; derailleur hangers, jockey wheels, and chain guides → Components > Drivetrain > Drivetrain parts; loose spokes, nipples, rim strips, and thru-axles → Components > Wheels/Tires > Wheels/Tires parts. Complete forks, shocks, brakesets, helmets, handlebars, stems, seatposts, and similar stay on their product leaf.',
  updated_at = NOW()
WHERE system_prompt NOT ILIKE '%Replacement parts and small hardware sold without the complete product%';
