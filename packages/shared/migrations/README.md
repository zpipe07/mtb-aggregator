# Database Migrations

For initial setup, run `schema.sql` and `seed.sql` from the parent directory.

## Running Migrations (local or remote)

From repo root, with `DATABASE_URL` in `.env` (or in the environment):

```bash
make db-migrate-remote
```

This runs `apps/api/cmd/migrate`, which:

1. Ensures a `schema_migrations` table exists and **skips any `*.sql` file whose name is already recorded** (so re-running `make db-migrate-remote` is safe).
2. Applies remaining files in sorted order (Neon and other Postgres; no `psql`/SNI required).

**First run on a database that already had migrations applied manually** (no prior `schema_migrations` rows): the tool may re-execute older files; they are written to be mostly additive / idempotent. If something fails, either fix the migration or insert rows into `schema_migrations` for files you know are already applied, then re-run.

Override the migrations directory: `MIGRATIONS_DIR=path/to/migrations make db-migrate-remote`

## Adding New Migrations

1. Create a new file: `NNN_description.sql` (e.g. `004_add_foo.sql`)
2. Use additive SQL only: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
3. Run `make db-migrate-remote` to apply (or run the new file manually)

### Recent migrations (reference)

| File | Purpose |
|------|---------|
| `019_llm_extraction_field_library.sql` | `llm_extraction_field_defs` + `llm_prompt_profile_fields` for composed extraction schemas |
| `020_multi_value_specs.sql` | Adds `multi_enum` to `llm_extraction_field_defs.field_type` (array values in `metadata.llm_specs`) |
| `021_variant_grouping.sql` | `store_listings.product_group_key`, `variant_options` (JSONB); index; backfill key from Shopify URLs |
| `022_bikes_taxonomy_subcategories.sql` | Bikes: `bikes-emtb` + MTB discipline children under `bikes-mountain` + Full Power/Lightweight under eMTB; high-priority `category_mappings` rows |
| `023_category_descriptions.sql` | `categories.description` — optional rubric text per category, injected into the LLM category classifier user prompt |
| `025_jenson_hide_superseded_parent_listings.sql` | Hides legacy JensonUSA listings whose `store_sku` is a strict prefix of another row’s SKU on the same `product_url` (parent row after per-variant scraping) |
| `026_universalcycles_hide_superseded_parent_listings.sql` | Hides Universal Cycles parent product-id rows when attribute SKU siblings (`{productId}-{attributeId}`) exist on the same `product_url` |
| `027_gear_eyewear.sql` | Gear: `gear-eyewear` + Sunglasses/Goggles children; priority mappings; product-name backfill for misfiled eyewear |
| `028_listing_enrichment_pipeline.sql` | `listing_enrichment` per-step state, `pdp_snapshots`, `enrichment_events`; backfill from `last_enriched_at` |
| `032_bb_headset_shelves.sql` | Components: `components-drivetrain-bottom-brackets` + `components-cockpit-headsets`; priority mappings; product-name backfill; LLM profiles for `bb_standard` / `headset_standard` |
| `033_listing_home_demoted.sql` | `store_listings.home_demoted` — admin can exclude listings from home page top-deal sections without hiding from `/deals` |
| `036_wheels_tubeless.sql` | Components: `components-wheels-tires-tubeless`; priority mappings for tubeless valve/tape/sealant/kit/insert keywords; product-name backfill; classifier rubrics |
| `037_flatten_clothing_tops_bottoms.sql` | Gear: flatten Clothing — Jerseys/Jackets/Shirts/Shorts/Pants/Socks directly under `gear-clothing`; remove Tops/Bottoms; priority leaf mappings; product-name backfill; LLM profile path updates |

After 019, run **`make backfill-field-library`** once (from repo root) to rename ambiguous `type` / `material` keys in `extraction_schema` and `metadata.llm_specs`, seed shared defs, and populate `llm_prompt_profile_fields`.

After 027, 032, 036, or 037, run **`make backfill-canonical-categories`** and **restart the API** so in-memory taxonomy reloads; these migrations also backfill by product name where applicable.

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
