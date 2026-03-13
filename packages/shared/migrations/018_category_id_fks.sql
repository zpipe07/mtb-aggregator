-- Add category_id FKs and backfill from existing canonical TEXT[] paths.
-- Old columns (canonical_category, canonical) remain for backward compatibility during transition.

-- 1. Add category_id to store_listings
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
CREATE INDEX IF NOT EXISTS idx_store_listings_category_id ON store_listings(category_id);

-- 2. Add category_id to category_mappings
ALTER TABLE category_mappings ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

-- 3. Add category_id to llm_prompt_profiles
ALTER TABLE llm_prompt_profiles ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

-- 4. Add valid_category_ids to llm_category_classifier (replaces valid_categories JSONB eventually)
ALTER TABLE llm_category_classifier ADD COLUMN IF NOT EXISTS valid_category_ids INTEGER[] DEFAULT '{}';

-- 5. Backfill: build (id, path) from categories tree; path = ARRAY[name] from root to node
WITH RECURSIVE cat_tree(id, path) AS (
  SELECT id, ARRAY[name]::text[] FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, (ct.path || c.name)::text[]
  FROM categories c
  JOIN cat_tree ct ON c.parent_id = ct.id
)
UPDATE store_listings sl
SET category_id = ct.id
FROM cat_tree ct
WHERE sl.canonical_category IS NOT NULL
  AND sl.canonical_category = ct.path;

-- 6. Backfill category_mappings
WITH RECURSIVE cat_tree(id, path) AS (
  SELECT id, ARRAY[name]::text[] FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, (ct.path || c.name)::text[]
  FROM categories c
  JOIN cat_tree ct ON c.parent_id = ct.id
)
UPDATE category_mappings cm
SET category_id = ct.id
FROM cat_tree ct
WHERE cm.canonical = ct.path;

-- 7. Backfill llm_prompt_profiles
WITH RECURSIVE cat_tree(id, path) AS (
  SELECT id, ARRAY[name]::text[] FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, (ct.path || c.name)::text[]
  FROM categories c
  JOIN cat_tree ct ON c.parent_id = ct.id
)
UPDATE llm_prompt_profiles lp
SET category_id = ct.id
FROM cat_tree ct
WHERE lp.canonical_category = ct.path;

-- 8. Populate valid_category_ids from valid_categories JSONB
WITH RECURSIVE cat_tree(id, path) AS (
  SELECT id, ARRAY[name]::text[] FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, (ct.path || c.name)::text[]
  FROM categories c
  JOIN cat_tree ct ON c.parent_id = ct.id
),
path_to_id AS (
  SELECT elem.ord, ct.id
  FROM llm_category_classifier lcc,
       jsonb_array_elements(lcc.valid_categories) WITH ORDINALITY AS elem(cat_path, ord),
       LATERAL (SELECT ARRAY(SELECT jsonb_array_elements_text(elem.cat_path)) AS arr) path_arr,
       cat_tree ct
  WHERE ct.path = path_arr.arr
)
UPDATE llm_category_classifier lcc
SET valid_category_ids = COALESCE((SELECT array_agg(id ORDER BY ord) FROM path_to_id), '{}');
