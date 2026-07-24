-- Add Colorado Cyclist store (Shopify sale collection)
INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Colorado Cyclist', 'https://coloradocyclist.com', 'https://coloradocyclist.com/collections/all-sale-products', 'coloradocyclist', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Colorado Cyclist');
