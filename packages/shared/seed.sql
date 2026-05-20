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

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Ride Bicycles', 'https://ridebicycles.com', 'https://ridebicycles.com/collections/all-products?page=1&rb_stock_status=In%20Stock&rb_discount_relative=40%25%7C50%25&tab=products&sort_by=sales_amount', 'ridebicycles', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Ride Bicycles');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Thunder Mountain Bikes', 'https://thundermountainbikes.com', 'https://thundermountainbikes.com/collections/shop-all-deals', 'thundermountainbikes', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Thunder Mountain Bikes');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Competitive Cyclist', 'https://www.competitivecyclist.com', 'https://www.competitivecyclist.com/rc/bikes-on-sale?rp=onsaleUS%3Atrue', 'competitivecyclist', 'impact_radius'
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Competitive Cyclist');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Canyon', 'https://www.canyon.com/en-us/', 'https://www.canyon.com/en-us/sale/', 'canyon', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Canyon');
