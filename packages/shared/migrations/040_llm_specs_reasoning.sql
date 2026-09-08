-- Add shared reasoning field for LLM spec extraction (stored at metadata.llm_specs_reasoning).
INSERT INTO llm_extraction_field_defs (field_key, field_type, description, label, filterable)
VALUES (
  'reasoning',
  'string',
  'Brief reasoning for the spec extraction',
  'Reasoning',
  false
)
ON CONFLICT (field_key) DO NOTHING;
