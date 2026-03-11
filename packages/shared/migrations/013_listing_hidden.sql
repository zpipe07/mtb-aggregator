ALTER TABLE store_listings ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_store_listings_hidden ON store_listings (hidden) WHERE hidden = true;
