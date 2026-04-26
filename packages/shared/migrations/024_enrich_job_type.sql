-- Distinguish enrichment runs from category-classify-only and other admin bulk jobs
ALTER TABLE enrich_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(32) NOT NULL DEFAULT 'enrich';
CREATE INDEX IF NOT EXISTS idx_enrich_jobs_job_type ON enrich_jobs(job_type, started_at DESC);
