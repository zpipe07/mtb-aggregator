-- Enrichment job history for admin dashboard
CREATE TABLE IF NOT EXISTS enrich_jobs (
    id SERIAL PRIMARY KEY,
    store_type VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, completed, failed
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    listings_processed INTEGER,
    listings_enriched INTEGER,
    errors TEXT[],
    triggered_by VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual, cron
    force_mode BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_enrich_jobs_started_at ON enrich_jobs(started_at DESC);
