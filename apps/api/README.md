# MTB Aggregator API

Go HTTP server that orchestrates scraping, enrichment, and serves the REST API. Uses standard library `net/http` and pgx for Postgres.

## Overview

- **Port:** 8080 (default)
- **Frameworks:** None; stdlib `net/http` only
- **Database:** PostgreSQL via pgx; all queries in `internal/db/`
- **LLM profiles:** When `llm_prompt_profile_fields` exists for a profile, getters hydrate `extraction_schema` from the field library + overrides (see [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) enrich section).

## Key Directories

| Path | Purpose |
|------|---------|
| `internal/api/` | HTTP handlers, route registration |
| `internal/db/` | Database queries (listings, stores, categories, etc.) |
| `internal/scheduler/` | Cron jobs: scrape (4h), enrich (nightly) |
| `internal/brand/` | Brand normalization via `brand_aliases.json` |
| `internal/taxonomy/` | Category mapping, in-memory cache |
| `internal/metadata/` | Spec extraction from enriched category paths |
| `internal/llm/` | LLM-driven spec extraction, classifier |

## Endpoints

### Public

- `GET /deals` — List deals; filters: `store`, `brand`, `min_discount`, `limit`, `offset`, `category_slug`, `spec_<key>`, `variant_<key>` (variant option name, case-insensitive match on JSON keys), `group_variants=true` (default in web; one row per `product_group_key` for Shopify), `q`, `sort`, etc.
- `GET /deals/:id` — Single deal by ID
- `GET /stores` — Stores with deal counts
- `GET /brands` — Distinct brands
- `GET /categories/tree` — Structured category tree (id, slug, name, parent_id)
- `GET /facets` — Filter facets for current query (`spec_facets`, `brand_facets`, `variant_facets` from `variant_options`, `price_range`, `total_matching`). Faceted behavior: `brand_facets` omit the `brand` query param when aggregating; each `spec_facets` key’s value list omits that key’s `spec_*` filter; each `variant_facets` dimension omits that dimension’s `variant_*` filter—so users can switch options without clearing first. Top 50 values per facet dimension.
- `GET /spec-values` — Spec values for filters
- `GET /status` — Health: last scrape per store, scraper reachable

### Trigger (cron or manual)

- `POST /scrape-now` — Trigger scrape job; optional `?store=<store_type>`
- `POST /enrich-now` — Trigger enrichment job; optional `?force=1`, `?store=`

**Auth:** Valid `CRON_SECRET` via `X-Cron-Secret` (or `?secret=` — avoid in production logs), or `Authorization: Bearer <ADMIN_PASSWORD>`. In production (`APP_ENV=production` or `RENDER=true`), if `CRON_SECRET` is unset, unauthenticated triggers are rejected unless `ALLOW_OPEN_CRON=1` (not recommended). Local dev allows unauthenticated triggers when `CRON_SECRET` is unset.

### Admin (Bearer token via `ADMIN_PASSWORD`)

- `POST /admin/auth` — Validate password (`{"password":"..."}`); use same value as `Authorization: Bearer` on other `/admin/*` routes
- `GET/POST/PUT/PATCH/DELETE /admin/*` — Dashboard, stores, taxonomy, profiles, etc.

**LLM extraction field library** (migrations `019`, `020`):

- `GET /admin/llm-extraction-field-defs` — List global field defs; optional `?q=` (search `field_key` / `label`)
- `POST /admin/llm-extraction-field-defs` — Create a def (`field_key`, `field_type`, `description`, optional `label`, `values`, `filterable`). `field_type` is one of `integer`, `number`, `string`, `enum`, or `multi_enum` (array of enum strings in `metadata.llm_specs`; facets and `/deals` filters match a selected value against the scalar or any array element)
- `GET/PUT/DELETE /admin/llm-extraction-field-defs/:id` — Read, update (`field_key` immutable), delete (409 if referenced by a profile composition row)

**LLM prompt profiles:** `PUT /admin/llm-profiles/:id` may include `profile_fields` (array of `{ field_def_id, sort_order, overrides, inline_field }`) to replace all composition rows for that profile and refresh `extraction_schema` from the hydrated merge. Do not send `extraction_schema` in the same request when `profile_fields` is present, or when the profile already has composition rows unless you are only updating name/category/prompt/enabled (omit `extraction_schema` entirely in that case).

## Environment

- `DATABASE_URL` — Postgres connection string
- `SCRAPER_SERVICE_URL` — Scraper base URL (default `http://localhost:3000`)
- `SCRAPER_SERVICE_SECRET` — Optional locally; **set in production** to match the scraper service. API sends `X-Scraper-Secret` on `POST /scrape` and `POST /enrich` to the scraper.
- `ADMIN_PASSWORD` — Required for admin endpoints (use a long random value in production)
- `ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW` — Failed `POST /admin/auth` attempts per IP before HTTP 429 (default `5`)
- `ADMIN_AUTH_WINDOW_SECONDS` — Rolling window for those attempts (default `900` = 15 minutes)
- `ADMIN_AUTH_RATE_LIMIT` — Set `off` / `false` / `0` to disable the limiter (local dev only)
- `CRON_SECRET` — Shared secret for `POST /scrape-now` and `POST /enrich-now` (`X-Cron-Secret`); **set in production** (see Trigger section)
- `APP_ENV` — Set `production` (or `prod`) for production security defaults (with `RENDER`, used to require cron auth when `CRON_SECRET` is unset)
- `ALLOW_OPEN_CRON` — Set to `1` only if you must allow unauthenticated cron triggers in production (unsafe; prefer `CRON_SECRET`)
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` — Cron schedules; set `disabled` for external cron
- **Startup catch-up:** If either in-process cron is enabled (not `disabled`), on each API start the scheduler checks the DB for the last scrape/enrich job start. If that job is older than **24 hours** (or missing), it runs once in the background with `triggered_by=catch-up`. Helps after deploys/restarts or if a scheduled run was missed while the process was down.
- `CORS_ORIGINS` — Comma-separated allowed `Origin` values for browser requests (e.g. `https://example.com,https://www.example.com`). If unset, defaults to `*` (any origin). Set explicitly when using a custom web domain and you want to restrict cross-origin access to the API.
- `SENTRY_DSN` — Optional; enables [Sentry](https://sentry.io) (HTTP panics and 5xx via `sentryhttp`)
- `SENTRY_ENVIRONMENT` — e.g. `production` / `development` (optional)
- `SENTRY_RELEASE` — Optional release override; if unset on Render, `RENDER_GIT_COMMIT` is used automatically
- Scheduler scrape/enrich jobs report to Sentry via `internal/sentryutil` (see [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry))

## Error reporting

When `SENTRY_DSN` is set (deployed environments should set it), **significant errors must reach Sentry**, not only logs: HTTP layer uses `sentryhttp`; handlers that catch errors and return 5xx should call `sentry.CaptureException`; background work uses `internal/sentryutil`. Full policy: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Running

```bash
# From repo root
cd apps/api && go run main.go
```

## Backfills

Run from repo root with API not required:

```bash
make backfill-brands
make backfill-canonical-categories   # Recategorize after taxonomy changes
make backfill-llm-specs              # Populate llm_specs from specs
make backfill-field-library          # After migration 019: rename ambiguous keys, seed field defs, fill profile_fields
make backfill-variant-options        # After migration 021: fetch Shopify JSON to fill variant_options for existing rows
```

`backfill-variant-options` only processes **Shopify** store types (`ridebicycles`, `worldwidecyclery`, `revelbikes`). **Primary path:** paginates each store’s **`stores.scrape_url`** collection **`…/products.json?limit=250&page=N`** (same as the scrapers), indexes products by handle, then matches each listing’s SKU to a variant — **far fewer HTTP calls** than per-product `GET /products/{handle}.json`. **Fallback** (on by default): for handles not in that collection index, fetches `/products/{handle}.json` using the listing’s origin; disable with `BACKFILL_VARIANT_FALLBACK_PRODUCT_JSON=0` if you only want collection data. **Pacing:** `BACKFILL_VARIANT_PAGE_DELAY_MS` between collection pages (default **500ms**); `BACKFILL_VARIANT_DELAY_MS` between fallback product requests (default **1s**); **up to 6** HTTP attempts per URL on **429** / **503** (`BACKFILL_VARIANT_MAX_ATTEMPTS`, max 20). Summary log includes `skipped_not_in_collection` when fallback is off and the handle was missing from the index. **Enrichment does not set `variant_options`**. Per-row debug: `BACKFILL_VARIANT_VERBOSE=1 make backfill-variant-options`.
