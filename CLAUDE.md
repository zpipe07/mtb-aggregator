# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Optional agent workflows** (spec-driven development, TDD, debugging, shipping, etc.) are **not** loaded automatically. They live in [`.agents/skills/workflows/`](.agents/skills/workflows/README.md); start from [`using-agent-skills/SKILL.md`](.agents/skills/workflows/using-agent-skills/SKILL.md) to pick a playbook. Stack-specific skills sit in [`.agents/skills/`](.agents/skills/) next to that folder.

## Project Overview

Mountain bike deals aggregator. Scrapes sale pages from MTB retailers, stores listings in Postgres, and serves them through a React UI.

## Repository Structure

pnpm monorepo with three apps and one shared package:

- `apps/scraper` — Node.js/TypeScript Express server using Playwright to scrape retailer pages
- `apps/api` — Go HTTP server (stdlib net/http + pgx); orchestrates scraping, enrichment, and serves the REST API
- `apps/web` — Next.js 15 (App Router) + React 19 + Tailwind v4 + TanStack Query + shadcn/ui
- `packages/shared` — SQL schema, numbered migrations, seed data, and JSON config files (brand aliases, category taxonomy)

## Development Setup

**Prerequisites:** Docker (for Postgres), Node.js >=20, pnpm, Go 1.25+

**First-time setup:**

```bash
pnpm install && cd apps/api && go mod download
make db-up           # Start Postgres in Docker
make db-migrate      # Apply base schema
make db-migrate-docker  # Apply incremental migrations
make db-seed         # Seed stores
```

**Running locally (three separate terminals):**

```bash
# Terminal 1 - Scraper (port 3000)
pnpm --filter @mtb-aggregator/scraper run dev

# Terminal 2 - API (port 8080)
cd apps/api && go run main.go

# Terminal 3 - Web (Next.js dev server, port 3000)
cd apps/web && pnpm run dev
```

**Environment variables** — create a `.env` at repo root:

- `DATABASE_URL` (defaults to `postgres://mtb:mtb@localhost:5432/mtb_deals`)
- `SCRAPER_SERVICE_URL` (defaults to `http://localhost:3000`)
- `SCRAPER_SERVICE_SECRET` — same value on API and scraper in production; API sends `X-Scraper-Secret` on scraper requests
- **`IMPACT_ACCOUNT_SID`** / **`IMPACT_AUTH_TOKEN`** (API) — Required for **Competitive Cyclist** scrapes: Impact Partner catalog HTTP Basic credentials (Settings → API). Without them, `store=competitivecyclist` scrape jobs fail (no Playwright fallback).
- **`IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST`** (API only, optional) — Impact Radius destination template for Competitive Cyclist outbound links. When set, each scrape upsert prefers this template for `affiliate_url`. When unset, `affiliate_url` falls back to the catalog **`Url`** when it carries Impact redirect attribution; otherwise the UI uses **`product_url`** (see [apps/api/README.md](apps/api/README.md)).
- Optional tuning: `IMPACT_CC_CATALOG_ID`, `IMPACT_CC_ITEM_SEARCH_QUERY`, `IMPACT_CC_CATEGORY_CONTAINS`, `IMPACT_CC_PAGE_SIZE`, `IMPACT_API_BASE_URL` — see [apps/api/README.md](apps/api/README.md).
- `ADMIN_PASSWORD` — required for admin UI login (strong random in production); `POST /admin/auth` is rate-limited by failed attempts per IP (`ADMIN_AUTH_*` env vars)
- `CRON_SECRET` — shared secret for `POST /scrape-now` / `enrich-now` (header `X-Cron-Secret`); **set in production**. If unset in production (`APP_ENV=production` or `RENDER=true`), those endpoints require admin Bearer unless `ALLOW_OPEN_CRON=1`
- `CORS_ORIGINS` — comma-separated allowed origins (defaults to `*`); when using a custom Vercel domain, include `https://yourdomain.com` (and `https://www...` if used) if not using `*`
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` — override cron schedules (set to `disabled` to use external cron)
- When in-process cron is enabled, startup **catch-up** runs scrape/enrich if the last DB job is more than 24h old (see [apps/api/README.md](apps/api/README.md))
- `NEXT_PUBLIC_API_URL` — client-side API base (defaults to `/api`); `API_URL` for server-side (full URL)
- `NEXT_PUBLIC_SITE_URL` — public web origin for Next.js `metadataBase`, canonical URLs, Open Graph, sitemap, and `robots.txt` sitemap line (**required on Vercel Production**; Preview falls back to `VERCEL_URL` when unset)
- `SENTRY_DSN` — optional; enables Sentry on the API when set (`SENTRY_ENVIRONMENT` optional; release = `SENTRY_RELEASE` or `RENDER_GIT_COMMIT` on Render). Scheduler jobs also send high-signal events via `internal/sentryutil` when DSN is set.
- **OpenAI (enrichment LLM):** `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL` (compatible API base). Retries: `OPENAI_MAX_RETRIES` (default `3`), `OPENAI_RETRY_BASE_MS` (default `500`). Category preservation during PDP enrichment: optional `LLM_CATEGORY_PRESERVE_THRESHOLD` (`0`–`1`; overrides classifier threshold / default `0.5` — see [apps/api/README.md](apps/api/README.md)).
- `NEXT_PUBLIC_SENTRY_DSN` — optional; enables Sentry on the web app (see [apps/web/README.md](apps/web/README.md)); Vercel provides `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` for release/environment mapping in `next.config.ts`
- Scraper: same `SENTRY_DSN` / `SENTRY_*` as API when enabled (see [apps/scraper/README.md](apps/scraper/README.md))
- **`SCRAPER_STORAGE_STATE`** (scraper) — Playwright cookie file for **Competitive Cyclist PDP enrich** (AWS WAF). Local bootstrap: generate `apps/scraper/cc-storage.json` via `playwright codegen --save-storage` (see [apps/scraper/README.md](apps/scraper/README.md#competitive-cyclist)). Production: mount as Render secret file on the **scraper** service (e.g. `/etc/secrets/cc-storage.json`). Optional **`SCRAPER_HEADED=1`** for the first manual WAF solve locally.

## Commands

```bash
# Scraper tests (vitest)
pnpm --filter @mtb-aggregator/scraper run test
pnpm --filter @mtb-aggregator/scraper run test:watch

# Manually trigger scraping/enrichment (API must be running)
make scrape-now              # all stores
make scrape-now-wwc          # worldwidecyclery only
make scrape-now-revel        # revelbikes only
make scrape-now-competitivecyclist  # CC only (Impact catalog on API; requires IMPACT_* creds)
make scrape-now-thundermountainbikes  # thundermountainbikes only
make scrape-now-canyon         # canyon only
make scrape-now-specialized    # specialized only
make enrich-now              # enrich unenriched listings
make enrich-now-revel        # revelbikes only (optional FORCE=1)
make enrich-now-competitivecyclist   # CC only (optional FORCE=1)
make enrich-now-thundermountainbikes   # thundermountainbikes only (optional FORCE=1)
make enrich-now-canyon         # canyon only (optional FORCE=1)
make enrich-now-specialized    # specialized only (optional FORCE=1)
make enrich-now FORCE=1      # re-enrich all
make impact-catalog-probe    # list Impact catalogs + sample catalog Items page (requires IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN)

# Database migrations against remote DB (set DATABASE_URL in .env)
make db-migrate-remote

# One-time backfills
make backfill-brands
make backfill-canonical-categories   # recategorize listings after taxonomy changes
make backfill-llm-specs              # populate llm_specs from specs (after migration 016)
make backfill-field-library          # migration 019: field defs + profile_fields + key renames
make backfill-cc-variants            # CC: PDP hasVariant grouping for existing Impact rows

# Build all
make build-all

# Component library (Storybook)
pnpm --filter @mtb-aggregator/web run storybook        # dev server on port 6006
pnpm --filter @mtb-aggregator/web run build-storybook  # static build to storybook-static/
```

## Architecture

### Data Flow

1. **Scheduler** (Go, `apps/api/internal/scheduler/`) runs cron jobs — scrape every 4h, enrich nightly at 2am
2. **Scrape job**: for each store, either **(a)** pulls Competitive Cyclist from the **Impact catalog API** in the Go scheduler when `IMPACT_ACCOUNT_SID` / `IMPACT_AUTH_TOKEN` are set, or **(b)** calls the scraper `POST /scrape` with the store's `scrape_url` and `store_type`
3. **Scraper service** uses Playwright parsers for non-CC stores; returns `ScrapeResult[]`
4. **API** upserts listings into Postgres, applying brand normalization and metadata extraction. For **Competitive Cyclist**, `affiliate_url` uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set, else the catalog **`Url`** when it’s a tracked hop; otherwise the UI uses **`product_url`**. Catalog **`Description`** may be merged into `metadata.description` for LLM enrichment (no PDP for CC).
5. **Enrich job**: fetches PDP URLs through `POST /enrich` for stores in `StoreTypesWithEnrichers` (includes **Competitive Cyclist** — enrich-only on the scraper; ingest remains Impact catalog). CC enrich parses PDP JSON-LD **`hasVariant`** and fans out **`product_group_key`** / **`variant_options`** to matching catalog SKUs (`make backfill-cc-variants` for existing rows).
6. **Category taxonomy** maps raw store category paths to canonical MTB categories (e.g. `["Components", "Brakes"]`)

### Scraper Service (`apps/scraper/`)

- Express server with `/scrape`, `/enrich`, `/health` endpoints
- Parsers live in `apps/scraper/src/parsers/` — one file per store
- `PARSERS` and `ENRICHERS` maps registered in `parsers/index.ts`
- Adding a new store: create parser in `parsers/`, add to maps in `parsers/index.ts`, add store enum value to `ScrapeRequestSchema`/`EnrichRequestSchema` in `types.ts`, insert store record in DB
- **JensonUSA clearance:** `data-product-result-dto` includes `variants[]`; `jensonusa-dto.ts` emits one `ScrapeResult` per variant (`product_group_key` = parent `code`, listing `variant_options` often Color-only). PDP enrich (`jensonusa-pdp.ts` + `enrichJensonUSA`) returns `variants[]` from `serverSideViewModel.variants`; the API fans out full `variant_options` and `is_in_stock` to all siblings. `make backfill-jenson-variants` replays that for existing rows. Migration `025` hides superseded parent-SKU rows after per-variant scrapes land.
- **Competitive Cyclist:** Impact catalog ingest (API) creates flat rows per SKU; PDP enrich (`cc-pdp-variants.ts` JSON-LD **`hasVariant`**) fans out **`product_group_key`** + **`variant_options`** to siblings sharing the same canonical **`product_url`**. `make backfill-cc-variants` replays grouping for existing rows. CC PDP fetch uses Playwright + **`SCRAPER_STORAGE_STATE`** (WAF cookies); bootstrap **`apps/scraper/cc-storage.json`** locally — [apps/scraper/README.md](apps/scraper/README.md#competitive-cyclist).

### API (`apps/api/`)

- Standard library `net/http`, no framework
- All DB queries in `internal/db/db.go` using pgx
- `internal/brand/` — brand normalization via `packages/shared/brand_aliases.json`
- `internal/taxonomy/` — category mapping with in-memory cache, loaded from `category_mappings` in DB (seeded from `category_taxonomy.json` when empty)
- `internal/impact/` — Impact Partner **product catalog** client (Competitive Cyclist ingest in the scheduler when credentials are set)
- `internal/db/categories.go` — structured category tree (id, slug, name, parent_id). Single source of truth; `category_id` FKs on listings, profiles, mappings
- `internal/metadata/` — extracts structured specs from enriched category paths and raw spec data
- Spec filters are LLM-driven: `llm_prompt_profiles` extraction schema (label, sort_order, filterable per field) controls which specs appear as filters per category; **ancestor profiles on the category tree contribute fields** to the effective schema unless a descendant overrides the same `field_key`. The legacy SpecFilterManager (spec_filter_config) is deprecated. With migration `019`, composed fields (`llm_prompt_profile_fields`) are hydrated to JSON on profile reads used by enrichment/facets. Field types include `multi_enum` (migration `020`) for multiple values per key (e.g. `intended_use`); facets and `/deals` filters match against scalars or any element of a stored JSON array.
- Admin endpoints under `/admin/*` require Bearer token auth (password set via `ADMIN_PASSWORD`)
- Public API: `GET /deals` (optional `group_variants=true`; repeated `brand`, `spec_<key>`, and `variant_<OptionName>` params OR within the same key on `variant_options` / `metadata.llm_specs`; `min_price`, **`max_price`**, `exclude_category_slug`; `sort` includes `discount`, `value` (savings amount), etc.), `/stores`, `/brands`, `/categories/tree`, `/facets` (includes `variant_facets`), `/spec-values`, `/status`. Deprecated: `/canonical-categories` (use `/categories/tree`)

### Error reporting (Sentry)

**Policy:** Where Sentry is configured (DSN set), significant errors must go to Sentry, not only logs. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#error-monitoring-sentry) for the full table and per-stack conventions (API handlers, `internal/sentryutil` for background work, web `catch` paths, scraper `captureRouteError`).

### Web (`apps/web/`)

- React Router routes: `/` (HomePage), `/deals` (DealsPage), `/admin/*` (AdminSection)
- **Component library**: shadcn/ui primitives (Button, Input, Card) in `src/components/ui/`; composed components (DealCard, CategoryCard, Pagination, etc.) in `src/components/`. Use primitives for new UI; add Storybook stories for new components.
- **Storybook**: `pnpm --filter @mtb-aggregator/web run storybook` — develop and document components in isolation; theme toolbar for light/dark.
- **Styling**: Tailwind v4 + CSS variables; semantic tokens (`bg-primary`, `text-muted-foreground`) over raw colors.
- Admin section includes: Dashboard, DataBrowser, StoreManager, TaxonomyManager, Categories (tree CRUD), SpecFilterManager (deprecated), PromptProfileManager, CategoryClassifierManager, NormalizationManager, Operations. Taxonomy, profiles, and classifier use category pickers backed by the structured tree.
- Admin login state stored in `localStorage`; `AdminGate` handles auth gating
- API base URL defaults to `http://localhost:8080`; configure via Vite proxy or env if needed

### Database Migrations

Base schema: `packages/shared/schema.sql`
Incremental: `packages/shared/migrations/` — numbered `001` onward, applied in sorted order.

For local Docker: `make db-migrate-docker`
For remote (Neon, etc.): `make db-migrate-remote` (uses `go run ./cmd/migrate`)

### Further Reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Data flow, services, component library, **error monitoring (Sentry) policy**
- [docs/DESIGN.md](docs/DESIGN.md) — Visual identity, copy guidelines, "dialed-in" vibe
- [docs/SCRAPING.md](docs/SCRAPING.md) — Parser structure, adding stores
- [docs/TAXONOMY.md](docs/TAXONOMY.md) — Category mappings, LLM classifier
- Domain READMEs: [apps/api/README.md](apps/api/README.md), [apps/scraper/README.md](apps/scraper/README.md), [apps/web/README.md](apps/web/README.md), [packages/shared/README.md](packages/shared/README.md)
