-- Complete bikes with store taxonomy "Full Suspension" / "Front Suspension"
-- were matching bare "suspension" (priority 37) before "full suspension"
-- (priority 4). Same class of bug as bare light / pump / tubeless / bmx
-- (ZAC-238 / Cambria, Colorado Cyclist, Mack Cycle).
-- Mapping-only; no listing writes.
--
-- Priority 38 ties with existing Forks so "Front Suspension Forks" still
-- hits the Forks row (lower id, first match). These new rows beat bare
-- "suspension" at 37. XC/Trail/Enduro at 51–53 stay more specific for
-- paths like "XC Full Suspension".

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
       'full suspension frames',
       'full suspension frame',
       'full-suspension frames',
       'full-suspension frame'
     ]::text[],
       ARRAY['Bikes', 'Frames']::text[],
       38,
       (SELECT id FROM categories WHERE slug = 'bikes-frames' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-frames')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE 'full suspension frames' = ANY (raw_keywords)
  );

INSERT INTO category_mappings (raw_keywords, canonical, priority, category_id)
SELECT ARRAY[
       'full suspension',
       'full-suspension',
       'front suspension',
       'front-suspension'
     ]::text[],
       ARRAY['Bikes', 'Mountain Bikes']::text[],
       38,
       (SELECT id FROM categories WHERE slug = 'bikes-mountain' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'bikes-mountain')
  AND NOT EXISTS (
    SELECT 1 FROM category_mappings
    WHERE 'front suspension' = ANY (raw_keywords)
  );
