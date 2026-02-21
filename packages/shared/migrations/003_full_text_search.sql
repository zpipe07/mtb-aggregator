-- Full-text search for store_listings (Phase 1)
-- Search over product_name, brand, and last category_path element.

ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate from product_name, brand, and last element of category_path
CREATE OR REPLACE FUNCTION store_listings_search_vector_trigger() RETURNS trigger AS $$
DECLARE
  last_cat text;
BEGIN
  last_cat := '';
  IF NEW.category_path IS NOT NULL AND array_length(NEW.category_path, 1) > 0 THEN
    last_cat := NEW.category_path[array_length(NEW.category_path, 1)];
  END IF;
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.product_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'A') ||
    setweight(to_tsvector('english', last_cat), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert/update
DROP TRIGGER IF EXISTS store_listings_search_vector_update ON store_listings;
CREATE TRIGGER store_listings_search_vector_update
  BEFORE INSERT OR UPDATE OF product_name, brand, category_path
  ON store_listings
  FOR EACH ROW
  EXECUTE PROCEDURE store_listings_search_vector_trigger();

-- Backfill existing rows (last category = category_path[array_length(category_path,1)])
UPDATE store_listings
SET search_vector = (
  setweight(to_tsvector('english', COALESCE(product_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
  setweight(to_tsvector('english',
    CASE WHEN category_path IS NOT NULL AND array_length(category_path, 1) > 0
         THEN category_path[array_length(category_path, 1)] ELSE '' END
  ), 'B')
)
WHERE search_vector IS NULL OR search_vector = ''::tsvector;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_store_listings_search ON store_listings USING GIN(search_vector);
