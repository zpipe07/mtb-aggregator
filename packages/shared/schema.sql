-- MTB Deal Aggregator - Listing-First Schema (MVP)
-- No products/brands tables; deduplication deferred to later phase.

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
