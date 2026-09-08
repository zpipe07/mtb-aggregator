-- Per-step claim leases so concurrent enrich claimers cannot process the same listing twice.

ALTER TABLE listing_enrichment
  ADD COLUMN IF NOT EXISTS pdp_leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classify_leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extract_leased_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_listing_enrichment_pdp_leased
  ON listing_enrichment (pdp_leased_until)
  WHERE pdp_leased_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listing_enrichment_classify_leased
  ON listing_enrichment (classify_leased_until)
  WHERE classify_leased_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listing_enrichment_extract_leased
  ON listing_enrichment (extract_leased_until)
  WHERE extract_leased_until IS NOT NULL;
