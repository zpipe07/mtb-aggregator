-- Add Canfield Bikes store (Shopify MTB sale collection)
INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Canfield', 'https://canfieldbikes.com', 'https://canfieldbikes.com/collections/mtb-sale', 'canfield', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Canfield');
