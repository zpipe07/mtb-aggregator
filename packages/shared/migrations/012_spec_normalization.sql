-- Spec key aliases: map raw PDP spec key substrings to canonical keys (admin-managed; seed from JSON when empty)
CREATE TABLE IF NOT EXISTS spec_key_aliases (
  id SERIAL PRIMARY KEY,
  raw_substr VARCHAR(200) NOT NULL,
  canonical_key VARCHAR(100) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raw_substr)
);

CREATE INDEX IF NOT EXISTS idx_spec_key_aliases_canonical ON spec_key_aliases(canonical_key);

-- Spec normalization rules: apply transforms to spec values at write time (per spec key)
CREATE TABLE IF NOT EXISTS spec_normalization_rules (
  id SERIAL PRIMARY KEY,
  spec_key VARCHAR(100) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rule_type CHECK (rule_type IN ('unit_normalize', 'value_map', 'regex_replace', 'case_normalize'))
);

CREATE INDEX IF NOT EXISTS idx_spec_normalization_rules_spec_key ON spec_normalization_rules(spec_key);
CREATE INDEX IF NOT EXISTS idx_spec_normalization_rules_priority ON spec_normalization_rules(priority DESC);
