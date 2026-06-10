# MTB Aggregator API

Go HTTP server that orchestrates scraping, enrichment, and serves the REST API. Uses standard library `net/http` and pgx for Postgres.

## Overview

- **Port:** 8080 (default)
- **Frameworks:** None; stdlib `net/http` only
- **Database:** PostgreSQL via pgx; all queries in `internal/db/`
- **LLM profiles:** When `llm_prompt_profile_fields` exists for a profile, getters hydrate `extraction_schema` from the field library + overrides. **Category hot paths** (`GetLLMPromptProfileForCategory*`) merge fields from **enabled** profiles on ancestor categories (root→leaf); duplicate `field_key` uses the **deepest** definition. `system_prompt` / profile identity come from the **nearest enabled** profile to the leaf. `GetLLMPromptProfileByID` (admin detail) hydrates that profile only; the response may include `effective_extraction_schema` when `category_id` is set (merged schema used at runtime for that category). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Key Directories

| Path                   | Purpose                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `internal/api/`        | HTTP handlers, route registration                                                                            |
| `internal/db/`         | Database queries (listings, stores, categories, etc.)                                                        |
| `internal/scheduler/`  | Cron jobs: scrape (4h), enrich (nightly)                                                                     |
| `internal/brand/`      | Brand normalization via `brand_aliases.json`                                                                 |
| `internal/taxonomy/`   | Category mapping, in-memory cache                                                                            |
| `internal/metadata/`   | Spec extraction from enriched category paths                                                                 |
| `internal/llm/`        | LLM-driven spec extraction, classifier                                                                       |
| `internal/llmlisting/` | Shared LLM classify + spec extraction from `store_listings` (scheduler enrichment and admin/spec-only paths) |

## Endpoints

### Public

- `GET /deals` — List deals; filters: `store`, repeated **`brand`** (OR across selected brands), `min_discount`, `min_price` / **`max_price`** (minimum / maximum `current_price`, inclusive), `exclude_category_slug` (omit listings whose `category_id` is in that category’s subtree; uncategorized rows are kept), `limit`, `offset`, `category_slug`, repeated **`spec_<key>`** (OR within the same key; AND across different keys), `group_variants=true` (default in web; one row per `product_group_key` for Shopify), `q`, `sort`. **Sort:** `discount` (default, highest discount %), `newest`, `value` (largest savings in currency: `original_price - current_price`), `price_asc`, `price_desc`, `relevance` (with `q`).
- `GET /deals/:id` — Single deal by ID
- `GET /stores` — Stores with deal counts
- `GET /brands` — Distinct brands
- `GET /categories/tree` — Structured category tree (id, slug, name, parent_id, optional `description`, `deal_count` per node: in-stock visible listing rows in that category or any descendant; **`product_count`**: distinct product groups in that subtree, matching `GET /deals?group_variants=true` totals). After migration `022`, the tree includes eMTB + MTB discipline subcategories; restart the process so `loadTaxonomyFromDB` picks up new `category_mappings` rows. Migration `023` adds per-category `description` (LLM classification hints; editable in admin Categories).
- `GET /facets` — Filter facets for current query (`spec_facets`, `brand_facets`, `price_range`, `total_matching`). Counts only **in-stock, non-hidden** listings—the same visibility as `GET /deals`. Accepts the same repeated `brand` / `spec_*` params as `GET /deals`, plus **`min_price`** / **`max_price`** when the UI scopes by price (e.g. SEO hub pages). Faceted behavior: `brand_facets` omit all `brand` params when aggregating brands; each `spec_facets` key’s value list omits that key’s `spec_*` filter—so users can add values without collapsing the facet. Top 50 values per facet dimension.
- `GET /spec-values` — Spec values for filters
- `GET /status` — Health: last scrape per store, scraper reachable

### Trigger (cron or manual)

- `POST /scrape-now` — Trigger scrape job; optional `?store=<store_type>`
- `POST /enrich-now` — Start an **async** PDP enrichment job (**202 Accepted**, `{"status":"ok","async":true}`); optional `?force=1`, `?store=` (store_type), optional `canonical_category=` and `llm_confidence_below=` (same filter semantics as the scheduler enrichment loop). Poll `GET /admin/enrich-jobs/:id` or the Operations UI for progress. Store types that run PDP enrichment are listed in `StoreTypesWithEnrichers` in `internal/db/db.go` (includes `jensonusa`, `worldwidecyclery`, `revelbikes`, `backcountry`, `competitivecyclist`, `ridebicycles`, `thundermountainbikes`, `mackcycle`, `canyon`, `specialized`, `trek`, `universalcycles`). **Competitive Cyclist** ingest is Impact catalog only; enrichment parses PDP JSON-LD **`hasVariant`** and fans out **`product_group_key`** / **`variant_options`** to matching catalog SKUs (`internal/db/cc_pdp_variants.go`). **Universal Cycles** scrape emits one parent row per product id; enrichment parses attribute blocks and upserts composite SKU siblings (`internal/db/uc_pdp_variants.go`).
- `POST /llm-specs-now` — Start an **async** `enrich_jobs` row (`job_type=llm_specs`) that runs LLM category classification (if configured) plus prompt-profile spec extraction **from data already on `store_listings`** — no PDP fetch. Uses the same cron/auth as scrape/enrich triggers. Query: optional `store` (store_type), `canonical_category=` (joined path string matching the admin listings filter), `llm_confidence_below=`, and `allow_empty_specs=1` to include listings missing `metadata.specs` (default filter requires non-empty specs).

**Auth:** Valid `CRON_SECRET` via `X-Cron-Secret` (or `?secret=` — avoid in production logs), or `Authorization: Bearer <ADMIN_PASSWORD>`. In production (`APP_ENV=production` or `RENDER=true`), if `CRON_SECRET` is unset, unauthenticated triggers are rejected unless `ALLOW_OPEN_CRON=1` (not recommended). Local dev allows unauthenticated triggers when `CRON_SECRET` is unset.

### Admin (Bearer token via `ADMIN_PASSWORD`)

- `POST /admin/auth` — Validate password (`{"password":"..."}`); use same value as `Authorization: Bearer` on other `/admin/*` routes
- `GET/POST/PUT/PATCH/DELETE /admin/*` — Dashboard, stores, taxonomy, profiles, etc.

**Admin Data Browser (`GET /admin/listings`):** Supports `category_slug` (matches `categories.slug`; filters `store_listings.category_id` by that node’s subtree — **same semantics as** `GET /deals?category_slug=`). When `category_slug` is present, `canonical_category` is ignored (slug wins). Also supports `canonical_category` as an exact path match on the `canonical_category` text array (useful for spotting drift vs `category_id`). Optional filter `store_type` is available on filtered ID listing paths (bulk bodies / `GET` params when added). Bulk bodies (`POST /admin/listings/bulk-classify`, `bulk-enrich`, **`bulk-llm-specs`**, **`bulk-set-category`**) accept the same filter fields including `category_slug`, plus optional **`store_type`** and **`has_non_empty_specs`** (for `bulk-llm-specs`, omit or `true` to require scraped specs; `false` includes rows with empty specs). **`bulk-set-category`** body adds `category_id` and updates all matching rows with `manual_category_override`. **`PATCH /admin/listings/:id/category`** — body `{"category_id": N}` sets `canonical_category`, `category_id`, and `metadata.manual_category_override`; fans out to non-hidden siblings with the same `store_id` + `product_group_key` (`siblings_updated` in response). When store `category_path` does not map via taxonomy to the chosen category, response may include **`suggested_mapping`** (`raw_keywords`, `canonical`, `reason`) for creating a taxonomy rule. Manual overrides are skipped by LLM classification and preserved during PDP enrichment. **`GET /admin/categories/:id/profile-fields`** — effective merged `extraction_schema.fields` for spec override UI. **`POST /admin/listings/:id/llm-specs`** re-runs LLM classify + extract for one listing; query **`allow_empty_specs=1`** bypasses the non-empty scraped-specs guard.

**LLM extraction field library** (migrations `019`, `020`):

- `GET /admin/llm-extraction-field-defs` — List global field defs; optional `?q=` (search `field_key` / `label`)
- `POST /admin/llm-extraction-field-defs` — Create a def (`field_key`, `field_type`, `description`, optional `label`, `values`, `filterable`). `field_type` is one of `integer`, `number`, `string`, `enum`, or `multi_enum` (array of enum strings in `metadata.llm_specs`; facets and `/deals` filters match a selected value against the scalar or any array element)
- `GET/PUT/DELETE /admin/llm-extraction-field-defs/:id` — Read, update (`field_key` immutable), delete (409 if referenced by a profile composition row)

**LLM prompt profiles:** `PUT /admin/llm-profiles/:id` may include `profile_fields` (array of `{ field_def_id, sort_order, overrides, inline_field }`) to replace all composition rows for that profile and refresh `extraction_schema` from the hydrated merge. Do not send `extraction_schema` in the same request when `profile_fields` is present, or when the profile already has composition rows unless you are only updating name/category/prompt/enabled (omit `extraction_schema` entirely in that case). `GET /admin/llm-profiles/:id` may include **`effective_extraction_schema`**: the merged extraction schema (this profile plus ancestor profiles on the category tree) used by enrichment and facets when `category_id` is set.

**Operational note:** After relying on inheritance, you can remove redundant `profile_fields` rows on child profiles that only duplicated a parent’s fields; keep child-only fields on the descendant profile.

## Environment

- `DATABASE_URL` — Postgres connection string
- `SCRAPER_SERVICE_URL` — Scraper base URL (default `http://localhost:3000`)
- `SCRAPER_SERVICE_SECRET` — Optional locally; **set in production** to match the scraper service. API sends `X-Scraper-Secret` on `POST /scrape` and `POST /enrich` to the scraper.
- **`IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST`** — Optional Impact Radius outbound template for **Competitive Cyclist** listings only. When set, each scrape upsert assigns `store_listings.affiliate_url` using your dashboard link format (`{{URL}}` substitution or literal `u=` prefix). When unset, ingest still fills **`affiliate_url`** from the catalog row’s **`Url`** when it’s an Impact redirect / unwrap wrapper (commissionable hop); plain www.competitivecyclist.com PDPs leave **`affiliate_url`** empty so the UI uses **`product_url`**. Catalog ingest **unwraps nested Impact `Url` redirects** so **`product_url`** is always the canonical PDP before applying this template — avoids double-wrapped links in the browser. Never commit actual program/partner IDs; set this only via deployment secrets.
- **Impact Partner catalog (Competitive Cyclist ingest)** — Required in production for CC: **`IMPACT_ACCOUNT_SID`** (Mediapartner SID) and **`IMPACT_AUTH_TOKEN`** (API token from Impact → Settings → API). The scheduler calls `GET .../Mediapartners/{sid}/Catalogs`, then paginates **`GET .../Mediapartners/{sid}/Catalogs/{catalogId}/Items`** (Basic auth, IR v12+) instead of the Playwright scraper. **Impact limits `Page` / `PageSize` pagination to a 20,000-row window** — the client stops before requesting past that (and logs if more data exists). Optional: **`IMPACT_CC_CATALOG_ID`** (skip auto-pick), **`IMPACT_CC_ITEM_SEARCH_QUERY`** (passed as `Query` when supported; otherwise items are filtered in the API after fetch), **`IMPACT_CC_CATEGORY_CONTAINS`** (default `bike`; substring match on category + product name — set empty in env to disable), **`IMPACT_CC_PAGE_SIZE`** (larger = fewer HTTP requests within the same 20k cap), **`IMPACT_API_BASE_URL`** (default `https://api.impact.com`). If credentials are unset, **`competitivecyclist` scrape fails loudly** (no WAF/Playwright fallback). Ops: `make impact-catalog-probe` runs `go run ./cmd/impact-catalog-probe` to list catalogs and print one page of catalog items.
- `ADMIN_PASSWORD` — Required for admin endpoints (use a long random value in production)
- `ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW` — Failed `POST /admin/auth` attempts per IP before HTTP 429 (default `5`)
- `ADMIN_AUTH_WINDOW_SECONDS` — Rolling window for those attempts (default `900` = 15 minutes)
- `ADMIN_AUTH_RATE_LIMIT` — Set `off` / `false` / `0` to disable the limiter (local dev only)
- `CRON_SECRET` — Shared secret for `POST /scrape-now`, `POST /enrich-now`, and **`POST /llm-specs-now`** (`X-Cron-Secret`); **set in production** (see Trigger section)
- `APP_ENV` — Set `production` (or `prod`) for production security defaults (with `RENDER`, used to require cron auth when `CRON_SECRET` is unset)
- `ALLOW_OPEN_CRON` — Set to `1` only if you must allow unauthenticated cron triggers in production (unsafe; prefer `CRON_SECRET`)
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` — Cron schedules; set `disabled` for external cron
- **`ENRICH_JOB_TIMEOUT`** / **`ENRICH_BATCH_SIZE`** — Optional Go duration (**default `4h`**) and batch size (**default `50`**) for in-process enrichment. Global jobs drain batches until the timeout or backlog is empty. When the work deadline is reached, `timed_out` (and other terminal statuses) are written using a **short detached DB context** so the row does not stay stuck `running` if the work `context` is already canceled (which would otherwise make `UpdateEnrichJob` fail under pgx).
- **Startup catch-up:** If either in-process cron is enabled (not `disabled`), on each API start the scheduler checks the DB for the last scrape/enrich job start. If that job is older than **24 hours** (or missing), it runs once in the background with `triggered_by=catch-up`. Helps after deploys/restarts or if a scheduled run was missed while the process was down.
- `CORS_ORIGINS` — Comma-separated allowed `Origin` values for browser requests (e.g. `https://example.com,https://www.example.com`). If unset, defaults to `*` (any origin). Set explicitly when using a custom web domain and you want to restrict cross-origin access to the API.
- **`SENTRY_DSN`** — **Required in production** (Render API). Enables [Sentry](https://sentry.io) (HTTP panics and 5xx via `sentryhttp`). Without it, `internal/sentryutil` calls from the scheduler are no-ops and admin Operations failures never reach Sentry. Use a dedicated **Go/API** project DSN (not the web or scraper DSN).
- `SENTRY_ENVIRONMENT` — e.g. `production` (recommended on Render)
- `SENTRY_RELEASE` — Optional release override; if unset on Render, `RENDER_GIT_COMMIT` is used automatically
- Scheduler scrape/enrich jobs report to Sentry via `internal/sentryutil`: store scrape failures, job `timed_out`, and **aggregated** completed enrich jobs with many listing errors (`phase=listing_errors_aggregate`). Per-listing enrich errors are capped in Sentry (see [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry)).
- **OpenAI (LLM classify + extract):** `OPENAI_API_KEY`; optional `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL` (OpenAI-compatible endpoints). Chat completions use retries with backoff on transient **429** (non-quota) and **5xx**; **`insufficient_quota`** is not retried. Tunables: `OPENAI_MAX_RETRIES` (default `3`), `OPENAI_RETRY_BASE_MS` (default `500` ms, exponential backoff with jitter; honors `Retry-After` when present).
- **`LLM_CATEGORY_PRESERVE_THRESHOLD`** — Optional `0`–`1`. When set, PDP enrichment updates `category_path` but **does not** overwrite `canonical_category` / `category_id` if `metadata.llm_category` already has a non-empty `canonical_category` and `confidence` ≥ this threshold. If unset, the active `llm_category_classifier.confidence_threshold` is used (else default `0.5`). Prevents path-based taxonomy from clobbering a prior confident LLM category when the classifier fails (e.g. quota).
- **Enrichment LLM behavior:** If OpenAI returns **`insufficient_quota`** during a scheduled enrich job, the scheduler **skips further LLM classify/extract calls for the remainder of that job** (scraped data still persists). The job’s `enrich_jobs` error list includes a quota message. `POST /admin/listings/:id/enrich` returns **`llm_warnings`** (string array) when classify or extract fails while the PDP update succeeded.

## Error reporting

When `SENTRY_DSN` is set ( **required on Render production** ), **significant errors must reach Sentry**, not only logs: HTTP layer uses `sentryhttp`; handlers that catch errors and return 5xx should call `sentry.CaptureException`; background work uses `internal/sentryutil`. Full policy: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

### Sentry alerts (recommended)

After setting `SENTRY_DSN` on Render and redeploying, confirm startup log `[sentry] initialized`, then in the **API** Sentry project:

1. **Issues** — filter `component:scheduler` to see scrape/enrich job events.
2. **Alerts → Create** — e.g. “A new issue is created” with filter `component:scheduler`, notify email or Slack.
3. Optional spike alert — “number of events” > 10 in 1 hour with tag `job:enrich`.

Scraper route failures (`route:scrape` / `route:enrich`) live in the **scraper** Sentry project, not the API project.

## Logging

Structured JSON logs via `internal/logutil` (`log/slog`). Env: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_HTTP_ACCESS` (default `auto` disables app access logs on Render). Schema and Render tips: [docs/LOGGING.md](../../docs/LOGGING.md).

## Running

```bash
# From repo root
cd apps/api && go run main.go
```

**Impact catalog discovery (Competitive Cyclist):** with `IMPACT_ACCOUNT_SID` + `IMPACT_AUTH_TOKEN` in `.env`, run `make impact-catalog-probe`.

## Backfills

Run from repo root with API not required:

```bash
make backfill-brands
make backfill-canonical-categories   # Recategorize after taxonomy changes
make backfill-llm-specs              # Populate llm_specs from specs
make backfill-field-library          # After migration 019: rename ambiguous keys, seed field defs, fill profile_fields
make backfill-variant-options        # After migration 021: fetch Shopify JSON to fill variant_options for existing rows
make backfill-jenson-variants        # JensonUSA: PDP enrich once per product_group_key; fan out variant_options + is_in_stock (scraper must be running)
make backfill-cc-variants            # Competitive Cyclist: PDP hasVariant grouping per product_url (scraper must be running; requires SCRAPER_STORAGE_STATE — see apps/scraper/README.md)
make requeue-wiped-enrichment        # Clear last_enriched_at when scrape-after-enrich wiped metadata; then make enrich-now FORCE=1
```

**Scrape upsert metadata:** On conflict, `UpsertListing` merges scrape-time metadata (name extraction, feed description) into existing `metadata` instead of replacing it. Empty scrape payloads preserve enriched `specs`, `llm_specs`, and `llm_category`. PDP specs keys are merged with name-extracted keys, not overwritten wholesale.

`backfill-variant-options` only processes **Shopify** store types (`ridebicycles`, `worldwidecyclery`, `revelbikes`, `thundermountainbikes`, `mackcycle`). **Primary path:** paginates each store’s **`stores.scrape_url`** collection **`…/products.json?limit=250&page=N`** (same as the scrapers), indexes products by handle, then matches each listing’s SKU to a variant — **far fewer HTTP calls** than per-product `GET /products/{handle}.json`. **Fallback** (on by default): for handles not in that collection index, fetches `/products/{handle}.json` using the listing’s origin; disable with `BACKFILL_VARIANT_FALLBACK_PRODUCT_JSON=0` if you only want collection data. **Pacing:** `BACKFILL_VARIANT_PAGE_DELAY_MS` between collection pages (default **500ms**); `BACKFILL_VARIANT_DELAY_MS` between fallback product requests (default **1s**); **up to 6** HTTP attempts per URL on **429** / **503** (`BACKFILL_VARIANT_MAX_ATTEMPTS`, max 20). Summary log includes `skipped_not_in_collection` when fallback is off and the handle was missing from the index. **Shopify:** scheduled enrichment does not set `variant_options` (use this backfill or re-scrape). **JensonUSA:** enrichment and `backfill-jenson-variants` call the scraper PDP enricher and fan out `variant_options` + `is_in_stock` to sibling rows (`BACKFILL_JENSON_VARIANT_DELAY_MS`, default **2000**; `BACKFILL_JENSON_VARIANT_MAX_RETRIES`, default **3**). Per-row debug: `BACKFILL_VARIANT_VERBOSE=1 make backfill-variant-options`.
