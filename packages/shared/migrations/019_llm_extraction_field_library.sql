-- Reusable LLM extraction field definitions + per-profile composition (overrides / inline fields).
-- Hydration merges defs + overrides into extraction_schema.fields at read time; see internal/db.

-- Global library: one row per output key (field_key matches SchemaField.key in apps/api/internal/llm).
CREATE TABLE IF NOT EXISTS llm_extraction_field_defs (
  id SERIAL PRIMARY KEY,
  field_key TEXT NOT NULL UNIQUE,
  field_type TEXT NOT NULL,
  description TEXT NOT NULL,
  label TEXT,
  values JSONB,
  filterable BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_llm_extraction_field_defs_field_type CHECK (
    field_type IN ('integer', 'number', 'string', 'enum')
  )
);

CREATE INDEX IF NOT EXISTS idx_llm_extraction_field_defs_field_key ON llm_extraction_field_defs (field_key);

-- Per-profile ordered list: reference a library def + optional overrides, OR a full inline SchemaField JSON.
CREATE TABLE IF NOT EXISTS llm_prompt_profile_fields (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES llm_prompt_profiles(id) ON DELETE CASCADE,
  field_def_id INTEGER REFERENCES llm_extraction_field_defs(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  overrides JSONB NOT NULL DEFAULT '{}',
  inline_field JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_llm_prompt_profile_fields_source CHECK (
    (field_def_id IS NOT NULL AND inline_field IS NULL)
    OR (field_def_id IS NULL AND inline_field IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_llm_prompt_profile_fields_profile_id ON llm_prompt_profile_fields (profile_id);
CREATE INDEX IF NOT EXISTS idx_llm_prompt_profile_fields_field_def_id ON llm_prompt_profile_fields (field_def_id);

COMMENT ON TABLE llm_extraction_field_defs IS 'Shared SchemaField templates; merged with overrides in llm_prompt_profile_fields at hydrate time.';
COMMENT ON TABLE llm_prompt_profile_fields IS 'Ordered fields per llm_prompt_profile; either field_def_id + overrides or inline_field JSON.';
