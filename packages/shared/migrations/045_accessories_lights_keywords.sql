-- Accessories > Lights: drop bare "light" so substring mapping cannot
-- match marketing copy like "Lightweight" (ZAC-234 / Bikes Online collection H1).
-- Same class of bug as bare pump / tubeless / bmx. Mapping-only; no listing writes.

UPDATE category_mappings
SET
  raw_keywords = ARRAY[
    'lights',
    'lighting',
    'bike light',
    'bike lights',
    'headlight',
    'headlights',
    'taillight',
    'taillights',
    'tail light',
    'front light',
    'rear light',
    'helmet light',
    'lamp',
    'lamps'
  ]::text[],
  updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'accessories-lights' LIMIT 1)
   OR canonical = ARRAY['Accessories', 'Lights']::text[];
