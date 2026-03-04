-- Spec filter config: visibility, merging, labels, sort order per spec key
CREATE TABLE IF NOT EXISTS spec_filter_config (
  id SERIAL PRIMARY KEY,
  spec_key VARCHAR(100) NOT NULL UNIQUE,
  visible BOOLEAN NOT NULL DEFAULT true,
  merge_into VARCHAR(100),
  display_label VARCHAR(200),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spec value aliases: normalize raw values to display values per spec key
CREATE TABLE IF NOT EXISTS spec_value_aliases (
  id SERIAL PRIMARY KEY,
  spec_key VARCHAR(100) NOT NULL,
  raw_value VARCHAR(500) NOT NULL,
  display_value VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(spec_key, raw_value)
);

CREATE INDEX IF NOT EXISTS idx_spec_value_aliases_spec_key ON spec_value_aliases(spec_key);
