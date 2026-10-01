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
| `038_accessories_pumps.sql` | Accessories: `accessories-pumps`; priority mappings for pump/inflator keywords; product-name backfill; classifier rubrics; strip `pump` from Tools mapping |
| `039_bikes_bmx.sql` | Bikes: `bikes-bmx`; priority mappings for BMX bike keywords; product-name backfill; classifier rubrics; `intended_use` enum adds BMX; optional BMX LLM profile |
| `040_llm_specs_reasoning.sql` | Shared `reasoning` field def for LLM spec extraction audit trail |
| `041_helmet_spec_extraction.sql` | `extractable` on field defs; helmet coverage rubric + system prompt; helmet `intended_use` override; `clothing_size` non-LLM |
| `042_enrichment_claim_leases.sql` | Per-step `*_leased_until` columns on `listing_enrichment` for concurrent-safe claim (`FOR UPDATE SKIP LOCKED`) |
| `043_store_pdp_pacing.sql` | Per-store PDP drainer pacing: `pdp_consecutive_failures`, `pdp_cooldown_until`, `pdp_last_fetch_at` on `stores` |
| `044_stamp_llm_pdp_hash.sql` | One-shot backfill: stamp `listing_enrichment.pdp_hash` from `pdp_snapshots.content_hash` and `prompt_profile_version` from enabled profiles for rows that completed LLM steps with NULL hash (fixes hourly LLM skip-loop). Apply on Neon with the API release (`make db-migrate-remote`). |
| `045_accessories_lights_keywords.sql` | Accessories › Lights: drop bare `light` from `category_mappings` so "Lightweight" collection copy cannot map complete bikes to Lights (ZAC-234). Mapping-only; remapping / classify after API restart. |
| `046_complete_bikes_not_suspension.sql` | Complete bikes: high-priority `full suspension` / `front suspension` → Mountain Bikes and `full suspension frames` → Frames so store taxonomy cannot dump bikes onto Components › Suspension (ZAC-238). Mapping-only; remap after API restart. |
| `047_unhide_latest_scrape_confirmed_listings.sql` | ZAC-217: unhide listings whose `last_scraped` is on/after that store’s latest completed scrape (`listings_upserted >= 10`), then re-apply Jenson `025` and Universal Cycles `026` parent-hide predicates. Idempotent. Numbered 047 because 046 is ZAC-238. |
| `048_most_specific_category_path.sql` | ZAC-245: high-priority `wheelset` / `bike wheels` / `complete wheels` → Complete wheels so store breadcrumbs like `Cycling Gear > … > Gravel Bike Wheels and Wheelsets` are not classified as Bikes or Gear. Also retargets the legacy `["Components", "Wheels"]` catch-all to `Wheels/Tires`. Mapping-only; remap after API restart. |
| `056_wheelsets_rims_not_tires.sql` | ZAC-263: classifier rubrics so Tires excludes wheelsets/rims/bundles; product-name backfill from Tires / Wheels/Tires parent to Complete wheels or Rims; copy confident `llm_category` Complete wheels / Rims onto canonical. Pair with `taxonomy.RefineWheelsTires`. Restart API after apply. |
| `057_component_parts_categories.sql` | ZAC-271: rename Components › * › **Parts** to **`{Parent} parts`**, `hide_from_nav`, classifier rubrics, high-priority small-hardware mappings, product-name backfill, classifier system-prompt rule. Restart API after apply. |
| `058_brakesets_not_small_parts.sql` | ZAC-272: expand Brake parts keywords (cables, adapters, lever parts) so they beat bare `brake` → Brakesets; product-name + path backfill; copy confident `llm_category` Brake parts onto canonical. Pair with `taxonomy.RefineBrakes`. Restart API after apply. |
| `059_electric_not_parts_or_analog_mtb.sql` | ZAC-273: Ride Bicycles `Electric Commuter & Urban Bikes` product_type dumped parts and analog MTBs onto Electric Bikes. Classifier rubrics; copy confident `llm_category` off the Electric tree (including hidden rows); title backfill analog bikes / framesets; null leftover parts. Pair with `taxonomy.RefineElectric` and scraper untrusted product_type. Restart API after apply. |
| `060_clothing_size_multi_enum.sql` | ZAC-248: `clothing_size` is `multi_enum` so comma-separated size charts split into array elements and the Size filter lists S, M, 32, … not `"S, M, L, XL"`. Re-run **`make backfill-clothing-size`**. |
| `061_strip_placeholder_variant_options.sql` | ZAC-278 / ZAC-281: strip Shopify `Title` / `Default Title` and schema.org leftover keys from stored `variant_options`. Scrape already omits them; upsert merge had kept existing placeholders when incoming options were empty. Idempotent. |
| `061_helmet_coverage_refine.sql` | ZAC-277: rewrite Helmets Coverage rubric (ear coverage + chin bar; Dropframe / Tyrant / Trigger X stay 3/4); copy genuine `llm_overrides.coverage` onto `llm_specs`; strip first-pass Half shell overrides on those families; one-shot model-family backfill. Pair with `metadata.InferHelmetCoverage` and **`make backfill-helmet-coverage`**. Restart API after apply; purge `/deals/c/gear/helmets` + `public-data`. |
| `062_cc_variant_groups.sql` | ZAC-294: set Competitive Cyclist `product_group_key` from the PDP slug and `Size` / `Position` from the catalog title so existing flat SKUs share a card. The next CC scrape fills `Color`. |
| `063_emtb_not_mountain_bikes.sql` | ZAC-296: drop `e-mountain bike` / `electric mountain bike` from the generic Electric Bikes mapping; move analog-MTB rows whose retailer path is eMTB onto Electric Mountain Bikes; rewrite stale `llm_category.canonical_category` of Mountain Bikes when the row is already on an eMTB shelf and the reasoning names an eMTB. Pair with `taxonomy.RefineElectric` (that shelf is not the ZAC-273 demotion). Restart the API before `make backfill-canonical-categories`. |
| `064_requeue_null_category_classify.sql` | ZAC-298: fill null `category_id` from a matching canonical path or an unambiguous sibling, then clear `classified_at` on in-stock rows that still have no category and no `llm_category`. Also clear quota `classify_dead` / `extract_dead`. Pair with classify completion rules (do not stamp success on quota or a missing category). Apply on Neon with the API release (`make db-migrate-remote`). |
| `049_giveaways.sql` | ZAC-47: `giveaways` table for curated MTB giveaways and raffles (unique `slug` / `entry_url`). Admin CRUD; not scraped. |
| `050_bike_size_extraction.sql` | ZAC-241: `bike_size` field def (filterable + extractable) and Bikes parent LLM profile so frame size is extracted and faceted; Mountain/Frames/BMX prompts get the size rubric. |
| `051_bike_size_cross_discipline.sql` | ZAC-241 follow-up: keep `bike_size` a **scalar enum** (one size per listing row; in-stock sets stay on chips) and expand values for road/gravel **cm** and BMX **top-tube** inches. Inherited by all Bikes children. |
| `052_gear_helmet_parts.sql` | ZAC-246: Gear › **Helmet parts** sibling of Helmets so replacement visors/liners/pads are not listed on `/deals/c/gear/helmets`. High-priority mappings + product-name backfill; remap after API restart. |
| `053_category_hide_from_nav.sql` | ZAC-251: `categories.hide_from_nav` so admins can omit a shelf from the header mega-menu without hiding it from `/categories` or classification. Seeds Helmet parts as hidden from nav. |
| `054_apparel_not_mountain_bikes.sql` | ZAC-264: high-priority apparel phrases (`mountain bike clothing`, `skirt`, `men's liners`, `road bike tops`, …) so Competitive Cyclist clothing breadcrumbs cannot land on Bikes. Path/name backfill from the Bikes tree; remap after API restart. Ingest also runs `taxonomy.RefineApparel` on garment titles so new unmapped leaves cannot re-land under Bikes. |
| `055_unhide_latest_full_scrape_confirmed_listings.sql` | ZAC-270: unhide listings confirmed by each store’s latest **full** scrape (at least half of that store’s 14-day max `listings_upserted`), then re-apply Jenson `025` / UC `026` parent-hide. Unlike `047`, ignores thin completed jobs (e.g. Jenson 149 vs 13k). Idempotent. |

After 019, run **`make backfill-field-library`** once (from repo root) to rename ambiguous `type` / `material` keys in `extraction_schema` and `metadata.llm_specs`, seed shared defs, and populate `llm_prompt_profile_fields`.

After 041, run **`make backfill-clothing-size`** to populate `metadata.llm_specs.clothing_size` from existing `variant_options` Size values.

After **060**, re-run **`make backfill-clothing-size`** so leftover LLM size charts (`S, M, L, XL`) become JSON arrays of individual sizes, then **restart the API** so the `multi_enum` field def is used.

After 050, run **`make backfill-bike-size`** to populate `metadata.llm_specs.bike_size` from variant Size on Bikes-tree listings, then **restart the API** so the new Bikes profile is used on the next LLM pass.

After 051, **restart the API** so the expanded `bike_size` enum (cm / TT) is used on the next LLM pass. Re-run **`make backfill-bike-size`** if existing variant labels were `58cm` / `21.5inch TT` and previously failed to normalize.

After **061**, **restart the API** so Helmets Coverage extraction uses the ear-coverage + chin-bar rubric (Dropframe / Tyrant / Trigger X = 3/4), then run **`make backfill-helmet-coverage`** for any rows the SQL ILIKE pass missed. Purge `/deals/c/gear/helmets` and `public-data` so ISR/facets refresh. Spec filters prefer `llm_overrides` over `llm_specs`; known 3/4 families beat a conflicting Half shell override.

After 027, 032, 036, 037, 038, 039, 045, 046, 048, **052**, **054**, **056**, **057**, **058**, or **059**, run **`make backfill-canonical-categories`** and **restart the API** so in-memory taxonomy reloads; these migrations also backfill by product name where applicable (`045`/`046`/`048` are mapping-only). Recategorize skips `manual_category_override`; confident `metadata.llm_category` still skips path remap (ZAC-234 Lights leftovers with a good LLM path still need admin classify or a copy-from-LLM pass) but **title refine still runs** (ZAC-263 Wheels/Tires, ZAC-272 Brakesets, ZAC-264 apparel, ZAC-273 Electric). After **`063`**, restart the API first: `RefineElectric` must be the build that leaves `Electric Mountain Bikes` in place, or recategorize will move Bullit / Vala-style eMTBs back to Mountain Bikes.

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
