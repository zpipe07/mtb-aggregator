-- ZAC-302: Ride Bicycles left Shopify for SmartEtailing.
-- Old /products/<handle> URLs 404. Hide those rows so shoppers stop
-- landing on dead pages. The next scrape upserts SmartEtailing SKUs
-- (se{productId}) with hidden = false.
-- Apply with the scraper release (make db-migrate-remote).

UPDATE stores
SET
  base_url = 'https://www.ridebicycles.com',
  scrape_url = 'https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/?rb_onSale=1&maxItems=60'
WHERE store_type = 'ridebicycles';

UPDATE store_listings
SET hidden = true
WHERE store_id IN (SELECT id FROM stores WHERE store_type = 'ridebicycles')
  AND hidden = false
  AND product_url !~ '/product/.+-[0-9]+\.htm';
