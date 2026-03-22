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

- `GET /deals` — List deals; filters: `store`, `brand`, `min_discount`, `limit`, `offset`, `category_id`, etc.
- `GET /deals/:id` — Single deal by ID
- `GET /stores` — Stores with deal counts
- `GET /brands` — Distinct brands
- `GET /categories/tree` — Structured category tree (id, slug, name, parent_id)
- `GET /facets` — Filter facets for current query
- `GET /spec-values` — Spec values for filters
- `GET /status` — Health: last scrape per store, scraper reachable

### Trigger (cron or manual)

- `POST /scrape-now` — Trigger scrape job; optional `?store=worldwidecyclery`
- `POST /enrich-now` — Trigger enrichment job
- `POST /scrape-now/:store` — Scrape single store

### Admin (Bearer token via `ADMIN_PASSWORD`)

- `POST /admin/login` — Get token
- `GET/POST/PUT/PATCH/DELETE /admin/*` — Dashboard, stores, taxonomy, profiles, etc.

**LLM extraction field library** (migration `019`):

- `GET /admin/llm-extraction-field-defs` — List global field defs; optional `?q=` (search `field_key` / `label`)
- `POST /admin/llm-extraction-field-defs` — Create a def (`field_key`, `field_type`, `description`, optional `label`, `values`, `filterable`)
- `GET/PUT/DELETE /admin/llm-extraction-field-defs/:id` — Read, update (`field_key` immutable), delete (409 if referenced by a profile composition row)

**LLM prompt profiles:** `PUT /admin/llm-profiles/:id` may include `profile_fields` (array of `{ field_def_id, sort_order, overrides, inline_field }`) to replace all composition rows for that profile and refresh `extraction_schema` from the hydrated merge. Do not send `extraction_schema` in the same request when `profile_fields` is present, or when the profile already has composition rows unless you are only updating name/category/prompt/enabled (omit `extraction_schema` entirely in that case).

## Environment

- `DATABASE_URL` — Postgres connection string
- `SCRAPER_SERVICE_URL` — Scraper base URL (default `http://localhost:3000`)
- `ADMIN_PASSWORD` — Required for admin endpoints
- `CRON_SECRET` — Optional; validate cron triggers via `X-Cron-Secret`
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` — Cron schedules; set `disabled` for external cron
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
```
