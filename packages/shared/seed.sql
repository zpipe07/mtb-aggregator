-- Seed stores (run after schema migration: make db-migrate)
INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'JensonUSA', 'https://www.jensonusa.com', 'https://www.jensonusa.com/clearance', 'jensonusa', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'JensonUSA');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Worldwide Cyclery', 'https://worldwidecyclery.com', 'https://worldwidecyclery.com/collections/deals', 'worldwidecyclery', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Worldwide Cyclery');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Revel Bikes', 'https://revelbikes.com', 'https://revelbikes.com/collections/the-boneyard', 'revelbikes', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Revel Bikes');
