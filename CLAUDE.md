# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mountain bike deals aggregator. Scrapes sale pages from MTB retailers, stores listings in Postgres, and serves them through a React UI.

## Repository Structure

pnpm monorepo with three apps and one shared package:

- `apps/scraper` — Node.js/TypeScript Express server using Playwright to scrape retailer pages
- `apps/api` — Go HTTP server (stdlib net/http + pgx); orchestrates scraping, enrichment, and serves the REST API
- `apps/web` — Next.js 15 (App Router) + React 18 + Tailwind v4 + TanStack Query + shadcn/ui
- `packages/shared` — SQL schema, numbered migrations, seed data, and JSON config files (brand aliases, category taxonomy)

## Development Setup

**Prerequisites:** Docker (for Postgres), Node.js >=20, pnpm, Go 1.24+

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
- `ADMIN_PASSWORD` — required for admin UI login
- `CRON_SECRET` — optional auth for cron trigger endpoints
- `CORS_ORIGINS` — comma-separated allowed origins (defaults to `*`)
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` — override cron schedules (set to `disabled` to use external cron)
- `NEXT_PUBLIC_API_URL` — client-side API base (defaults to `/api`); `API_URL` for server-side (full URL)
- `SENTRY_DSN` — optional; enables Sentry on the API when set (`SENTRY_ENVIRONMENT` optional; release = `SENTRY_RELEASE` or `RENDER_GIT_COMMIT` on Render). Scheduler jobs also send high-signal events via `internal/sentryutil` when DSN is set.
- `NEXT_PUBLIC_SENTRY_DSN` — optional; enables Sentry on the web app (see [apps/web/README.md](apps/web/README.md)); Vercel provides `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` for release/environment mapping in `next.config.ts`
- Scraper: same `SENTRY_DSN` / `SENTRY_*` as API when enabled (see [apps/scraper/README.md](apps/scraper/README.md))

## Commands

```bash
# Scraper tests (vitest)
pnpm --filter @mtb-aggregator/scraper run test
pnpm --filter @mtb-aggregator/scraper run test:watch

# Manually trigger scraping/enrichment (API must be running)
make scrape-now              # all stores
make scrape-now-wwc          # worldwidecyclery only
make scrape-now-revel        # revelbikes only
make enrich-now              # enrich unenriched listings
make enrich-now FORCE=1      # re-enrich all

# Database migrations against remote DB (set DATABASE_URL in .env)
make db-migrate-remote

# One-time backfills
make backfill-brands
make backfill-canonical-categories   # recategorize listings after taxonomy changes
make backfill-llm-specs              # populate llm_specs from specs (after migration 016)
make backfill-field-library          # migration 019: field defs + profile_fields + key renames

# Build all
make build-all

# Component library (Storybook)
pnpm --filter @mtb-aggregator/web run storybook        # dev server on port 6006
pnpm --filter @mtb-aggregator/web run build-storybook  # static build to storybook-static/
```

## Architecture

### Data Flow

1. **Scheduler** (Go, `apps/api/internal/scheduler/`) runs cron jobs — scrape every 4h, enrich nightly at 2am
2. **Scrape job**: for each store, calls the scraper service `POST /scrape` with the store's `scrape_url` and `store_type`
3. **Scraper service** uses Playwright parsers to extract listings from sale pages; returns `ScrapeResult[]`
4. **API** upserts listings into Postgres, applying brand normalization and metadata extraction
5. **Enrich job**: fetches PDP (product detail page) URLs through `POST /enrich` to get detailed specs (wheel size, travel, groupset, etc.) and a full category path
6. **Category taxonomy** maps raw store category paths to canonical MTB categories (e.g. `["Components", "Brakes"]`)

### Scraper Service (`apps/scraper/`)

- Express server with `/scrape`, `/enrich`, `/health` endpoints
- Parsers live in `apps/scraper/src/parsers/` — one file per store
- `PARSERS` and `ENRICHERS` maps registered in `parsers/index.ts`
- Adding a new store: create parser in `parsers/`, add to maps in `parsers/index.ts`, add store enum value to `ScrapeRequestSchema`/`EnrichRequestSchema` in `types.ts`, insert store record in DB

### API (`apps/api/`)

- Standard library `net/http`, no framework
- All DB queries in `internal/db/db.go` using pgx
- `internal/brand/` — brand normalization via `packages/shared/brand_aliases.json`
- `internal/taxonomy/` — category mapping with in-memory cache, loaded from `category_mappings` in DB (seeded from `category_taxonomy.json` when empty)
- `internal/db/categories.go` — structured category tree (id, slug, name, parent_id). Single source of truth; `category_id` FKs on listings, profiles, mappings
- `internal/metadata/` — extracts structured specs from enriched category paths and raw spec data
- Spec filters are LLM-driven: `llm_prompt_profiles` extraction schema (label, sort_order, filterable per field) controls which specs appear as filters per category. The legacy SpecFilterManager (spec_filter_config) is deprecated. With migration `019`, composed fields (`llm_prompt_profile_fields`) are hydrated to JSON on profile reads used by enrichment/facets.
- Admin endpoints under `/admin/*` require Bearer token auth (password set via `ADMIN_PASSWORD`)
- Public API: `GET /deals`, `/stores`, `/brands`, `/categories/tree`, `/facets`, `/spec-values`, `/status`. Deprecated: `/canonical-categories` (use `/categories/tree`)

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
