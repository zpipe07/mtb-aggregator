-- ZAC-248: clothing_size Size facet should list individual sizes, not comma-separated charts.
-- Store size-runs as multi_enum arrays (facets/filters already expand JSON arrays).
-- Idempotent: safe to re-run.

UPDATE llm_extraction_field_defs
SET
  field_type = 'multi_enum',
  filterable = true,
  description = 'This listing''s size(s), copied from variant_options Size (not extracted by the LLM). Comma-separated size charts are split into an array so the Size filter shows S, M, 32, … rather than "S, M, L, XL".',
  updated_at = NOW()
WHERE field_key = 'clothing_size';
