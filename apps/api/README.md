# MTB Aggregator API

Go HTTP server that orchestrates scraping, enrichment, and serves the REST API. Uses standard library `net/http` and pgx for Postgres.

## Overview

- **Port:** 8080 (default)
- **Frameworks:** None; stdlib `net/http` only
- **Database:** PostgreSQL via pgx; all queries in `internal/db/`

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

- `POST /scrape-now` — Trigger scrape job; optional `?store=<store_type>`
- `POST /enrich-now` — Trigger enrichment job; optional `?force=1`, `?store=`

**Auth:** Valid `CRON_SECRET` via `X-Cron-Secret` (or `?secret=` — avoid in production logs), or `Authorization: Bearer <ADMIN_PASSWORD>`. In production (`APP_ENV=production` or `RENDER=true`), if `CRON_SECRET` is unset, unauthenticated triggers are rejected unless `ALLOW_OPEN_CRON=1` (not recommended). Local dev allows unauthenticated triggers when `CRON_SECRET` is unset.

### Admin (Bearer token via `ADMIN_PASSWORD`)

- `POST /admin/auth` — Validate password (`{"password":"..."}`); use same value as `Authorization: Bearer` on other `/admin/*` routes
- `GET/POST/PUT/PATCH/DELETE /admin/*` — Dashboard, stores, taxonomy, profiles, etc.

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
```
