-- Allow multi_enum field type for LLM extraction (array of enum strings in metadata.llm_specs).
ALTER TABLE llm_extraction_field_defs
  DROP CONSTRAINT IF EXISTS chk_llm_extraction_field_defs_field_type,
  ADD CONSTRAINT chk_llm_extraction_field_defs_field_type CHECK (
    field_type IN ('integer', 'number', 'string', 'enum', 'multi_enum')
  );
