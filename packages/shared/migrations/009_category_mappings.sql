-- Category taxonomy mappings (raw keywords -> canonical path). Admin-managed; seed from JSON in Go when empty.
CREATE TABLE IF NOT EXISTS category_mappings (
  id SERIAL PRIMARY KEY,
  raw_keywords TEXT[] NOT NULL,
  canonical TEXT[] NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
