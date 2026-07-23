-- Per-listing enrichment step state, PDP snapshots, and event ledger (durable pipeline without a queue).

CREATE TABLE IF NOT EXISTS listing_enrichment (
  listing_id INTEGER PRIMARY KEY REFERENCES store_listings(id) ON DELETE CASCADE,
  pdp_fetched_at TIMESTAMPTZ,
  pdp_hash TEXT,
  pdp_attempts INTEGER NOT NULL DEFAULT 0,
  pdp_error TEXT,
  next_pdp_attempt_at TIMESTAMPTZ,
  pdp_dead BOOLEAN NOT NULL DEFAULT false,
  classified_at TIMESTAMPTZ,
  classify_attempts INTEGER NOT NULL DEFAULT 0,
  classify_error TEXT,
  next_classify_attempt_at TIMESTAMPTZ,
  classify_dead BOOLEAN NOT NULL DEFAULT false,
  llm_confidence REAL,
  prompt_profile_version TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ,
  extract_attempts INTEGER NOT NULL DEFAULT 0,
  extract_error TEXT,
  next_extract_attempt_at TIMESTAMPTZ,
  extract_dead BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_enrichment_next_pdp ON listing_enrichment (next_pdp_attempt_at)
  WHERE pdp_dead = false;
CREATE INDEX IF NOT EXISTS idx_listing_enrichment_next_classify ON listing_enrichment (next_classify_attempt_at)
  WHERE classify_dead = false;
CREATE INDEX IF NOT EXISTS idx_listing_enrichment_next_extract ON listing_enrichment (next_extract_attempt_at)
  WHERE extract_dead = false;

CREATE TABLE IF NOT EXISTS pdp_snapshots (
  listing_id INTEGER PRIMARY KEY REFERENCES store_listings(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrichment_events (
  id BIGSERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES store_listings(id) ON DELETE CASCADE,
  step VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error TEXT,
  model TEXT,
  confidence REAL,
  duration_ms INTEGER,
  job_id INTEGER REFERENCES enrich_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_events_listing ON enrichment_events (listing_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_events_step_created ON enrichment_events (step, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_events_job ON enrichment_events (job_id) WHERE job_id IS NOT NULL;

-- Backfill: listings already enriched should not re-run PDP/LLM on rollout.
INSERT INTO listing_enrichment (listing_id, pdp_fetched_at, pdp_hash, classified_at, extracted_at, llm_confidence)
SELECT
  l.id,
  l.last_enriched_at,
  NULL,
  CASE WHEN l.canonical_category IS NOT NULL AND cardinality(l.canonical_category) > 0 THEN l.last_enriched_at END,
  CASE WHEN l.metadata ? 'llm_specs' AND l.metadata->'llm_specs' IS NOT NULL AND l.metadata->'llm_specs' != 'null'::jsonb THEN l.last_enriched_at END,
  CASE
    WHEN l.metadata->'llm_category'->>'confidence' ~ '^[0-9.]+$'
    THEN (l.metadata->'llm_category'->>'confidence')::real
    ELSE NULL
  END
FROM store_listings l
WHERE l.last_enriched_at IS NOT NULL
ON CONFLICT (listing_id) DO NOTHING;
