-- Seed stores (run after schema migration: make db-migrate)
INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'JensonUSA', 'https://www.jensonusa.com', 'https://www.jensonusa.com/clearance', 'jensonusa', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'JensonUSA');
