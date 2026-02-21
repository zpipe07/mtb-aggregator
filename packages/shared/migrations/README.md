# Database Migrations

For initial setup, run `schema.sql` and `seed.sql` from the parent directory.

## Running Migrations (local or remote)

From repo root, with `DATABASE_URL` in `.env` (or in the environment):

```bash
make db-migrate-remote
```

This runs all `*.sql` files in this directory in sorted order using the API’s Go/pgx stack, so it works with Neon and other Postgres (no `psql`/SNI required).

Override the migrations directory: `MIGRATIONS_DIR=path/to/migrations make db-migrate-remote`

## Adding New Migrations

1. Create a new file: `NNN_description.sql` (e.g. `004_add_foo.sql`)
2. Use additive SQL only: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
3. Run `make db-migrate-remote` to apply (or run the new file manually)

## Verifying Phase 2 changes (currency, scraper health, category_path)

1. **Apply migrations** (if you haven’t):
   ```bash
   make db-migrate-remote
   ```

2. **Run at least one scrape** (API + scraper must be running):
   ```bash
   make scrape-now-revel
   # or make scrape-now-wwc or make scrape-now (all stores)
   ```

3. **Check scraper health and categories in the DB** (replace with your connection string or use `psql $DATABASE_URL`):
   ```sql
   -- Stores should have last_scrape_result_count set after a run
   SELECT name, store_type, last_scrape_result_count FROM stores ORDER BY name;

   -- Listings from Shopify stores (Revel Bikes, Worldwide Cyclery) should have category_path from the scraper
   SELECT s.name, l.product_name, l.category_path
   FROM store_listings l
   JOIN stores s ON s.id = l.store_id
   WHERE l.category_path IS NOT NULL AND array_length(l.category_path, 1) > 0
   LIMIT 5;

   -- Currency column exists (default USD)
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'store_listings' AND column_name = 'currency';
   ```

4. **Optional: enrichment** (JensonUSA only for now): run `make enrich-now` with API + scraper up; then confirm JensonUSA listings have `category_path` and `last_enriched_at` set.
