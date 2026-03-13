-- LLM category classifier: singleton config for product categorization via LLM.
-- Runs after taxonomy.Map() to refine canonical_category using product name, description, breadcrumbs, specs.
CREATE TABLE IF NOT EXISTS llm_category_classifier (
  id SERIAL PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  valid_categories JSONB NOT NULL DEFAULT '[]',
  confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config (one row). valid_categories from category_taxonomy canonical paths.
INSERT INTO llm_category_classifier (system_prompt, valid_categories, confidence_threshold, enabled)
VALUES (
  'You are a product categorization expert for a mountain bike retailer aggregator.
Given a product listing with its name, description, breadcrumb path, and specs,
determine the most specific canonical category from the provided list.

Consider:
- Product name is the strongest signal (e.g. "Bike" vs "Frame" vs "Fork")
- Description text for product type clues
- Specs like travel, wheel size for sub-categorization
- Breadcrumbs as supporting context (but they can be misleading)

Choose the most specific matching category. For example, prefer
["Bikes", "Mountain"] over ["Bikes"] when the product is clearly a mountain bike.',
  '[
    ["Bikes", "Mountain"],
    ["Bikes", "Electric"],
    ["Bikes", "Gravel"],
    ["Bikes", "Road"],
    ["Bikes", "Kids"],
    ["Bikes"],
    ["Components", "Drivetrain"],
    ["Components", "Brakes"],
    ["Components", "Suspension"],
    ["Components", "Wheels"],
    ["Components", "Cockpit"],
    ["Components"],
    ["Gear", "Helmets"],
    ["Gear", "Protection"],
    ["Gear", "Clothing"],
    ["Gear", "Shoes"],
    ["Gear"],
    ["Accessories", "Tools"],
    ["Accessories", "Bags"],
    ["Accessories", "Lights"],
    ["Accessories"]
  ]'::jsonb,
  0.80,
  true
);
