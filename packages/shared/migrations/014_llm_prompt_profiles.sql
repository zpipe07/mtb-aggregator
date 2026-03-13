-- LLM prompt profiles: per canonical category, system prompt + extraction schema for structured spec extraction.
CREATE TABLE IF NOT EXISTS llm_prompt_profiles (
  id SERIAL PRIMARY KEY,
  canonical_category TEXT[] NOT NULL,
  name VARCHAR(200) NOT NULL,
  system_prompt TEXT NOT NULL,
  extraction_schema JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canonical_category)
);

CREATE INDEX IF NOT EXISTS idx_llm_prompt_profiles_canonical_category ON llm_prompt_profiles USING GIN (canonical_category);

-- Seed default MTB profile
INSERT INTO llm_prompt_profiles (canonical_category, name, system_prompt, extraction_schema)
VALUES (
  ARRAY['Bikes', 'Mountain'],
  'Mountain Bike Classification',
  'You are a mountain bike spec extraction expert. Given a product listing, extract structured specs.

Only include fields you can determine from the provided data. Use null for unknown fields.
Set confidence 0-1 based on how certain you are about the overall extraction.',
  '{
    "fields": [
      {"key": "front_travel_mm", "type": "integer", "description": "Front fork travel in mm"},
      {"key": "rear_travel_mm", "type": "integer", "description": "Rear suspension travel in mm (null for hardtails)"},
      {"key": "wheel_size", "type": "enum", "values": ["29", "27.5", "26", "mullet"], "description": "Wheel size"},
      {"key": "mtb_class", "type": "enum", "values": ["XC", "Downcountry", "Trail", "Enduro", "DH", "Dirt Jump", "Fat Bike"], "description": "Mountain bike classification"},
      {"key": "frame_material", "type": "enum", "values": ["Carbon", "Aluminum", "Steel", "Titanium"], "description": "Frame material"},
      {"key": "confidence", "type": "number", "description": "Overall confidence 0-1"}
    ]
  }'::jsonb
)
ON CONFLICT (canonical_category) DO NOTHING;
