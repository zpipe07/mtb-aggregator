-- MTB Deal Aggregator - Listing-First Schema (MVP)
-- Variant grouping: product_group_key groups Shopify variants; see migration 021 for index/backfill.

-- Retailers we scrape
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  scrape_url VARCHAR(500) NOT NULL,
  store_type VARCHAR(50) NOT NULL DEFAULT 'jensonusa',
  affiliate_network VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (name)
);

-- Individual deal listings from each store
CREATE TABLE IF NOT EXISTS store_listings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_sku VARCHAR(100) NOT NULL,
  product_name VARCHAR(500) NOT NULL,
  current_price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2),
  product_url TEXT NOT NULL,
  affiliate_url TEXT,
  image_url TEXT,
  brand VARCHAR(100),
  category_path TEXT[],
  last_enriched_at TIMESTAMP WITH TIME ZONE,
  is_in_stock BOOLEAN DEFAULT true,
  last_scraped TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (store_id, store_sku)
);

CREATE INDEX IF NOT EXISTS idx_store_listings_store_id ON store_listings(store_id);
CREATE INDEX IF NOT EXISTS idx_store_listings_last_scraped ON store_listings(last_scraped);
CREATE INDEX IF NOT EXISTS idx_store_listings_current_price ON store_listings(current_price);

-- Price history for charts and deal detection
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES store_listings(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);

-- Raw scraped data for debugging when scrapers break
CREATE TABLE IF NOT EXISTS scraped_raw_data (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  raw_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrations for existing databases (run after initial schema)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_type VARCHAR(50) DEFAULT 'jensonusa';
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS category_path TEXT[];
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP WITH TIME ZONE;
-- Migrate category string to category_path array, then drop category
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_listings' AND column_name = 'category') THEN
    UPDATE store_listings SET category_path = string_to_array(trim(category), ' > ') WHERE category IS NOT NULL AND category != '' AND (category_path IS NULL OR category_path = '{}');
    ALTER TABLE store_listings DROP COLUMN IF EXISTS category;
  END IF;
END $$;

-- Variant grouping (Shopify): same columns as migration 021
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS product_group_key TEXT;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS variant_options JSONB;
CREATE INDEX IF NOT EXISTS idx_store_listings_product_group_key ON store_listings (product_group_key) WHERE product_group_key IS NOT NULL;
