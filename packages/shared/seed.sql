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

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Specialized', 'https://www.specialized.com/us/en', 'https://www.specialized.com/us/en/shop/sale', 'specialized', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Specialized');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Mack Cycle', 'https://www.mackcycle.com', 'https://www.mackcycle.com/collections/sale', 'mackcycle', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Mack Cycle');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Trek', 'https://www.trekbikes.com/us/en_US', 'https://www.trekbikes.com/us/en_US/bikes/mountain-bikes/c/B300/?pageSize=24&q=%3Arelevance%3AsaleFlag%3Atrue&sort=relevance', 'trek', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Trek');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Universal Cycles', 'https://www.universalcycles.com', 'https://www.universalcycles.com/specials.php', 'universalcycles', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Universal Cycles');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'N+1 Bikes', 'https://www.n1bikes.com', 'https://www.n1bikes.com/categories/all?discount=0.2', 'n1bikes', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'N+1 Bikes');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Fox Racing', 'https://www.foxracing.com', 'https://www.foxracing.com/legacy-drops/mtb/', 'foxracing', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Fox Racing');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Ride Concepts', 'https://rideconcepts.com', 'https://rideconcepts.com/collections/on-sale', 'rideconcepts', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Ride Concepts');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Leatt', 'https://us.leatt.com', 'https://us.leatt.com/collections/mtb-hot-deals', 'leatt', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Leatt');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Bell', 'https://www.bellhelmets.com', 'https://www.bellhelmets.com/legacy-garage/cycling/', 'bell', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Bell');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Giro', 'https://www.giro.com', 'https://www.giro.com/archives/cycling/', 'giro', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Giro');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Chromag', 'https://us.chromagbikes.com', 'https://us.chromagbikes.com/collections/sale', 'chromag', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Chromag');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'The Gravity Cartel', 'https://thegravitycartel.com', 'https://thegravitycartel.com/collections/sale', 'gravitycartel', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'The Gravity Cartel');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Bikes Online', 'https://www.bikesonline.com', 'https://www.bikesonline.com/collections/sale', 'bikesonline', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Bikes Online');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Evo', 'https://www.evo.com', 'https://www.evo.com/collections/bike-sale', 'evo', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Evo');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'Cambria Bikes', 'https://cambriabike.com', 'https://cambriabike.com/collections/all-sale-products', 'cambriabikes', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Cambria Bikes');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT '365 Cycles', 'https://365cycles.com', 'https://365cycles.com/collections/shopify-sale', '365cycles', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = '365 Cycles');

INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
SELECT 'The Lost Co', 'https://thelostco.com', 'https://thelostco.com/collections/clearance-mountain-bike-parts', 'thelostco', NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'The Lost Co');
