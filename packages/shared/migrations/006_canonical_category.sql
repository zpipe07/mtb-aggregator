-- Canonical MTB category for filtering/display (mapped from raw category_path via config)
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS canonical_category TEXT[];
