-- Optional: support non-USD prices for future international stores (e.g. Chain Reaction Cycles GBP)
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
