-- Admin can demote listings from home page "Top deals" sections without hiding from /deals.
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS home_demoted BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_store_listings_home_demoted ON store_listings (home_demoted) WHERE home_demoted = true;
