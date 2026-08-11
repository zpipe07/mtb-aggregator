-- Update JensonUSA scrape URL from /clearance to /sale
UPDATE stores
SET scrape_url = 'https://www.jensonusa.com/sale'
WHERE store_type = 'jensonusa'
  AND scrape_url = 'https://www.jensonusa.com/clearance';
