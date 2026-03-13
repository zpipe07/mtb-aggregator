ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_store_listings_hidden ON store_listings (hidden) WHERE hidden = true;
