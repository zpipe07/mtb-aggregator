-- Categories: structured tree replacing string-based canonical paths.
-- Single source of truth for category hierarchy; store_listings and other tables will reference via category_id.
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  sort_order INT NOT NULL DEFAULT 0,
  depth INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Seed from canonical taxonomy (matches category_taxonomy.json and llm_category_classifier valid_categories).
-- Roots: Bikes, Components, Gear, Accessories
-- ON CONFLICT: safe when re-running migrate on DBs that already applied this migration.
INSERT INTO categories (slug, name, parent_id, sort_order, depth) VALUES
  ('bikes', 'Bikes', NULL, 1, 0),
  ('components', 'Components', NULL, 2, 0),
  ('gear', 'Gear', NULL, 3, 0),
  ('accessories', 'Accessories', NULL, 4, 0)
ON CONFLICT (slug) DO NOTHING;

-- Bikes children
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'bikes-mountain', 'Mountain', id, 1, 1 FROM categories WHERE slug = 'bikes'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'bikes-electric', 'Electric', id, 2, 1 FROM categories WHERE slug = 'bikes'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'bikes-gravel', 'Gravel', id, 3, 1 FROM categories WHERE slug = 'bikes'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'bikes-road', 'Road', id, 4, 1 FROM categories WHERE slug = 'bikes'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'bikes-kids', 'Kids', id, 5, 1 FROM categories WHERE slug = 'bikes'
ON CONFLICT (slug) DO NOTHING;

-- Components children
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'components-drivetrain', 'Drivetrain', id, 1, 1 FROM categories WHERE slug = 'components'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'components-brakes', 'Brakes', id, 2, 1 FROM categories WHERE slug = 'components'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'components-suspension', 'Suspension', id, 3, 1 FROM categories WHERE slug = 'components'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'components-wheels', 'Wheels', id, 4, 1 FROM categories WHERE slug = 'components'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'components-cockpit', 'Cockpit', id, 5, 1 FROM categories WHERE slug = 'components'
ON CONFLICT (slug) DO NOTHING;

-- Gear children
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'gear-helmets', 'Helmets', id, 1, 1 FROM categories WHERE slug = 'gear'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'gear-protection', 'Protection', id, 2, 1 FROM categories WHERE slug = 'gear'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'gear-clothing', 'Clothing', id, 3, 1 FROM categories WHERE slug = 'gear'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'gear-shoes', 'Shoes', id, 4, 1 FROM categories WHERE slug = 'gear'
ON CONFLICT (slug) DO NOTHING;

-- Accessories children
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'accessories-tools', 'Tools', id, 1, 1 FROM categories WHERE slug = 'accessories'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'accessories-bags', 'Bags', id, 2, 1 FROM categories WHERE slug = 'accessories'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id, sort_order, depth)
SELECT 'accessories-lights', 'Lights', id, 3, 1 FROM categories WHERE slug = 'accessories'
ON CONFLICT (slug) DO NOTHING;
