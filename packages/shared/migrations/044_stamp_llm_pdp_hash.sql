-- Stamp pdp_hash from PDP snapshots for listings that completed LLM steps before hash tracking.
-- Migration 028 backfill set classified_at/extracted_at from last_enriched_at but left pdp_hash NULL.
-- Claim SQL treats NULL IS DISTINCT FROM snapshot.content_hash as due; skip logic treated empty hash as unchanged.

UPDATE listing_enrichment le
SET
  pdp_hash = ps.content_hash,
  updated_at = NOW()
FROM pdp_snapshots ps
WHERE le.listing_id = ps.listing_id
  AND (le.pdp_hash IS NULL OR le.pdp_hash = '')
  AND ps.content_hash IS NOT NULL
  AND ps.content_hash <> ''
  AND (le.classified_at IS NOT NULL OR le.extracted_at IS NOT NULL);

UPDATE listing_enrichment le
SET
  prompt_profile_version = lp.updated_at,
  updated_at = NOW()
FROM store_listings l
JOIN llm_prompt_profiles lp ON lp.category_id = l.category_id AND lp.enabled = true
WHERE le.listing_id = l.id
  AND le.prompt_profile_version IS NULL
  AND (le.classified_at IS NOT NULL OR le.extracted_at IS NOT NULL);
