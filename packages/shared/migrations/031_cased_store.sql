-- Add Cased store (Shopify MTB collection)
INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Cased', 'https://ridecased.com', 'https://ridecased.com/collections/mtb', 'cased', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Cased');
