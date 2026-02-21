-- Store last scrape result count for health monitoring (flag when 0 results for 2+ consecutive runs)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS last_scrape_result_count INTEGER;
