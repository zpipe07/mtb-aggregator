-- Scrape job history for admin dashboard
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    store_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, completed, failed
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    listings_found INTEGER,
    listings_upserted INTEGER,
    errors TEXT[],
    warnings TEXT[],
    triggered_by VARCHAR(20) NOT NULL DEFAULT 'manual'  -- manual, cron
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON scrape_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_store_id ON scrape_jobs(store_id);
