-- Add display metadata (label, sort_order, filterable) to the Bikes > Mountain profile extraction schema.
-- These fields control how spec filters appear in the UI. Run backfill-llm-specs to populate
-- metadata.llm_specs from existing enriched listings.
UPDATE llm_prompt_profiles
SET extraction_schema = '{
  "fields": [
    {"key": "front_travel_mm", "type": "integer", "description": "Front fork travel in mm", "label": "Front Travel (mm)", "sort_order": 1},
    {"key": "rear_travel_mm", "type": "integer", "description": "Rear suspension travel in mm (null for hardtails)", "label": "Rear Travel (mm)", "sort_order": 2},
    {"key": "wheel_size", "type": "enum", "values": ["29", "27.5", "26", "mullet"], "description": "Wheel size", "label": "Wheel Size", "sort_order": 3},
    {"key": "mtb_class", "type": "enum", "values": ["XC", "Downcountry", "Trail", "Enduro", "DH", "Dirt Jump", "Fat Bike"], "description": "Mountain bike classification", "label": "MTB Class", "sort_order": 4},
    {"key": "frame_material", "type": "enum", "values": ["Carbon", "Aluminum", "Steel", "Titanium"], "description": "Frame material", "label": "Frame Material", "sort_order": 5},
    {"key": "confidence", "type": "number", "description": "Overall confidence 0-1", "filterable": false}
  ]
}'::jsonb,
    updated_at = NOW()
WHERE canonical_category = ARRAY['Bikes', 'Mountain'];
