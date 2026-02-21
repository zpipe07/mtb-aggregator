-- Extracted product attributes (wheel size, travel, year, groupset) for filtering/facets
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_store_listings_metadata_gin ON store_listings USING GIN (metadata);
