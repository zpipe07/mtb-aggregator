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

**Prerequisites:** Docker (for Postgres), Node.js >=20, pnpm, Go 1.26+

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
- `SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC` / **`LLM_CRON_SPEC`** — override cron schedules (set to `disabled` to use external cron). **`ENRICH_CRON_SPEC`** defaults to **`disabled`** (resident PDP drainer); **`LLM_CRON_SPEC`** (default hourly) plus scrape/PDP kicks run classify+extract (`job_type=llm_specs`).
- **`ENRICH_PDP_DRAINER`** — set **`0`** to disable the resident PDP drainer; **`ENRICH_PDP_MIN_INTERVAL`** (default **`15s`**), **`ENRICH_PDP_COOLDOWN`** (default **`30m`**), **`ENRICH_PDP_STALE_AFTER`** (default **`720h`** / 30d).
- **`SCRAPE_JOB_TIMEOUT`** / **`SCRAPE_INGEST_TIMEOUT`** — scrape fetch vs ingest budgets (defaults **20m** / **15m**); scraper HTTP client aligns with fetch timeout; detached finalize for terminal scrape job status
- **`ENRICH_MAX_LISTINGS`** — optional cap on listings processed **per step per job** (default unlimited). PDP and LLM are separate jobs; each step in a job gets its own budget (e.g. `100` on an LLM job allows up to 200 listings for classify+extract).
- **`ENRICH_LLM_JOB_TIMEOUT`** — LLM-only job wall clock (default **`30m`**; PDP jobs use **`ENRICH_JOB_TIMEOUT`**, default **`4h`**)
- **`ENRICH_CALL_TIMEOUT`** (API) — per-listing timeout for `POST /enrich` scraper calls (default **`3m`**; scraper wall-clock default **`120s`** via **`ENRICH_TIMEOUT_MS`**)
- **`ENRICH_CLAIM_LEASE`** (API) — per-step in-flight claim lease (default **`10m`**); `ClaimForStep` uses `FOR UPDATE SKIP LOCKED` on `listing_enrichment.*_leased_until` so concurrent enrich jobs cannot double-process a listing
- **`ENRICH_CIRCUIT_BREAKER_THRESHOLD`** (API) — consecutive PDP failures for one store before persistent cooldown (default **`5`**; set **`0`** to disable). Applies to drainer and burst enrich jobs.
- When in-process scrape or LLM cron is enabled, startup **catch-up** runs scrape (24h) and LLM (1h) if overdue — **not** PDP burst (see [apps/api/README.md](apps/api/README.md)). **`POST /enrich-now`** is the operator PDP burst path.
- `NEXT_PUBLIC_API_URL` — client-side API base (defaults to `/api`); `API_URL` for server-side (full URL)
- `NEXT_PUBLIC_SITE_URL` — public web origin for Next.js `metadataBase`, canonical URLs, Open Graph, sitemap, and `robots.txt` sitemap line (**required on Vercel Production**; Preview falls back to `VERCEL_URL` when unset)
- **`SENTRY_DSN`** — **required on Render API in production**; enables Sentry (`SENTRY_ENVIRONMENT` optional; release = `SENTRY_RELEASE` or `RENDER_GIT_COMMIT`). Scheduler jobs send high-signal events via `internal/sentryutil` only when DSN is set.
- **OpenAI (enrichment LLM):** `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL` (compatible API base). Retries: `OPENAI_MAX_RETRIES` (default `3`), `OPENAI_RETRY_BASE_MS` (default `500`). Category preservation during PDP enrichment: optional `LLM_CATEGORY_PRESERVE_THRESHOLD` (`0`–`1`; overrides classifier threshold / default `0.5` — see [apps/api/README.md](apps/api/README.md)).
- `NEXT_PUBLIC_SENTRY_DSN` — optional; enables Sentry on the web app (see [apps/web/README.md](apps/web/README.md)); Vercel provides `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` for release/environment mapping in `next.config.ts`
- Scraper: same `SENTRY_DSN` / `SENTRY_*` as API when enabled (see [apps/scraper/README.md](apps/scraper/README.md))
- **Logging (all apps):** `LOG_LEVEL` (default `info`), `LOG_FORMAT` (`json` or `text`), `LOG_HTTP_ACCESS` (`auto` — off on Render/Vercel to avoid duplicating platform access logs). See [docs/LOGGING.md](docs/LOGGING.md).
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
make scrape-now-mackcycle      # mackcycle only
make scrape-now-rideconcepts   # rideconcepts only
make scrape-now-leatt          # leatt only
make scrape-now-chromag        # chromag only
make scrape-now-gravitycartel  # gravitycartel only
make scrape-now-bell           # bell only
make scrape-now-giro           # giro only
make scrape-now-bikesonline    # bikesonline only
make scrape-now-evo            # evo only
make scrape-now-cambriabikes   # cambriabikes only
make scrape-now-365cycles      # 365cycles only
make scrape-now-thelostco      # thelostco only
make scrape-now-hayes          # hayes only
make scrape-now-raceface       # raceface only
make scrape-now-ion            # ion only
make scrape-now-coloradocyclist  # coloradocyclist only
make scrape-now-canfield        # canfield only
make scrape-now-cased           # cased only
make scrape-now-trek           # trek only
make scrape-now-universalcycles  # universalcycles only
make enrich-now              # enrich unenriched listings
make enrich-now-revel        # revelbikes only (optional FORCE=1)
make enrich-now-competitivecyclist   # CC only (optional FORCE=1) — no-op for scheduled enrich (CC not in StoreTypesWithEnrichers); use admin bulk-enrich or backfill-cc-variants
make enrich-now-thundermountainbikes   # thundermountainbikes only (optional FORCE=1)
make enrich-now-canyon         # canyon only (optional FORCE=1)
make enrich-now-specialized    # specialized only (optional FORCE=1)
make enrich-now-mackcycle      # mackcycle only (optional FORCE=1)
make enrich-now-rideconcepts   # rideconcepts only (optional FORCE=1)
make enrich-now-leatt          # leatt only (optional FORCE=1)
make enrich-now-chromag        # chromag only (optional FORCE=1)
make enrich-now-gravitycartel  # gravitycartel only (optional FORCE=1)
make enrich-now-bell           # bell only (optional FORCE=1)
make enrich-now-giro           # giro only (optional FORCE=1)
make enrich-now-bikesonline    # bikesonline only (optional FORCE=1)
make enrich-now-evo            # evo only (optional FORCE=1)
make enrich-now-cambriabikes   # cambriabikes only (optional FORCE=1)
make enrich-now-365cycles      # 365cycles only (optional FORCE=1)
make enrich-now-thelostco      # thelostco only (optional FORCE=1)
make enrich-now-hayes          # hayes only (optional FORCE=1)
make enrich-now-raceface       # raceface only (optional FORCE=1)
make enrich-now-ion            # ion only (optional FORCE=1)
make enrich-now-coloradocyclist  # coloradocyclist only (optional FORCE=1)
make enrich-now-canfield           # canfield only (optional FORCE=1)
make enrich-now-cased              # cased only (optional FORCE=1)
make enrich-now-trek           # trek only (optional FORCE=1)
make enrich-now-universalcycles  # universalcycles only (optional FORCE=1)
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
make requeue-wiped-enrichment        # clear last_enriched_at when scrape wiped metadata; then enrich-now FORCE=1

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
4. **API** upserts listings into Postgres, applying brand normalization and metadata extraction. Scrape upsert sets **`hidden = false`**; after ingest, stale-cleanup hides listings missing from that scrape, then Jenson/UC re-hide superseded parent SKUs. For **Competitive Cyclist**, `affiliate_url` uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set, else the catalog **`Url`** when it’s a tracked hop; otherwise the UI uses **`product_url`**. Catalog **`Description`** may be merged into `metadata.description` for LLM enrichment (no PDP for CC).
5. **Enrich jobs (split):** **PDP** — resident **drainer** (round-robin, per-store pacing) plus optional **`POST /enrich-now`** burst (`job_type=enrich`) via `internal/enrichstate/`; per-listing step state in `listing_enrichment`, snapshots in `pdp_snapshots`, events in `enrichment_events`. **LLM** — async `llm_specs` jobs (classify + extract via `ClaimForStep`) kick after successful scrapes, after drainer PDP success (debounced), after burst PDP jobs finalize, and on **`LLM_CRON_SPEC`** (hourly). Listings need a PDP snapshot before LLM steps run. Fetches PDP URLs through `POST /enrich` for stores in `StoreTypesWithEnrichers` (excludes **Competitive Cyclist**). Optional **`ENRICH_MAX_LISTINGS`** caps listings per step per job. CC variant grouping is handled via admin/backfill (`make backfill-cc-variants`) when WAF cookies are refreshed.
6. **Category taxonomy** maps raw store category paths to canonical MTB categories (e.g. `["Components", "Brakes"]`)

### Scraper Service (`apps/scraper/`)

- Express server with `/scrape`, `/enrich`, `/health` endpoints
- Parsers live in `apps/scraper/src/parsers/` — one file per store
- `PARSERS` and `ENRICHERS` maps registered in `parsers/index.ts`
- Adding a new store: create parser in `parsers/`, add to maps in `parsers/index.ts`, add store enum value to `ScrapeRequestSchema`/`EnrichRequestSchema` in `types.ts`, insert store record in DB
- **JensonUSA clearance:** `data-product-result-dto` includes `variants[]`; `jensonusa-dto.ts` emits one `ScrapeResult` per variant (`product_group_key` = parent `code`, listing `variant_options` often Color-only). PDP enrich (`jensonusa-pdp.ts` + `enrichJensonUSA`) returns `variants[]` from `serverSideViewModel.variants`; the API fans out full `variant_options` and `is_in_stock` to all siblings. `make backfill-jenson-variants` replays that for existing rows. Migration `025` hides superseded parent-SKU rows after per-variant scrapes land; scrape upsert sets `hidden = false`, then the scheduler re-applies that parent hide (ZAC-217). Jenson `/sale` paginates up to `JENSON_MAX_PAGES` (default 50, not the global `SCRAPER_MAX_PAGES=10`); a truncated scrape skips `HideStaleListings`.
- **Competitive Cyclist:** Impact catalog ingest (API) creates flat rows per SKU. CC is **not** in `StoreTypesWithEnrichers` (scheduled enrich skips CC). The scraper enricher (`cc-pdp-variants.ts`) remains for admin/manual use and `make backfill-cc-variants` when WAF cookies are valid (`SCRAPER_STORAGE_STATE`; see [apps/scraper/README.md](apps/scraper/README.md#competitive-cyclist)).
- **Universal Cycles:** fetch + Cheerio on `specials.php` (~615 sale products, `?resultpage=` pagination). Scrape emits one parent row per product id; PDP enrich (`universalcycles-pdp.ts`) returns `variants[]` per `#attribute_{id}` block; the API upserts composite SKU rows (`{productId}-{attributeId}`) via `ApplyUniversalCyclesVariantFanout` and hides the parent. Migration `026` hides superseded parent rows when attribute siblings exist; the scheduler re-applies that hide after scrape unhide (ZAC-217). OOS attributes stay listed with `is_in_stock=false` (Jenson pattern).

### API (`apps/api/`)

- Standard library `net/http`, no framework
- All DB queries in `internal/db/db.go` using pgx
- `internal/brand/` — brand normalization via `packages/shared/brand_aliases.json`
- `internal/taxonomy/` — category mapping with in-memory cache, loaded from `category_mappings` in DB (seeded from `category_taxonomy.json` when empty). Accessories › Lights keywords omit bare `light` so “Lightweight” collection copy cannot dump complete bikes into Lights (ZAC-234 / migration `045`).
- `internal/impact/` — Impact Partner **product catalog** client (Competitive Cyclist ingest in the scheduler when credentials are set)
- `internal/db/categories.go` — structured category tree (id, slug, name, parent_id). Single source of truth; `category_id` FKs on listings, profiles, mappings
- `internal/metadata/` — extracts structured specs from enriched category paths and raw spec data
- Spec filters are LLM-driven: `llm_prompt_profiles` extraction schema (label, sort_order, filterable per field) controls which specs appear as filters per category; **ancestor profiles on the category tree contribute fields** to the effective schema unless a descendant overrides the same `field_key`. The legacy SpecFilterManager (spec_filter_config) is deprecated. With migration `019`, composed fields (`llm_prompt_profile_fields`) are hydrated to JSON on profile reads used by enrichment/facets. Field types include `multi_enum` (migration `020`) for multiple values per key (e.g. `intended_use`); facets and `/deals` filters match against scalars or any element of a stored JSON array.
- Admin endpoints under `/admin/*` require Bearer token auth (password set via `ADMIN_PASSWORD`)
- Public API: `GET /deals` (optional `group_variants=true`; repeated `brand`, `spec_<key>` params OR within the same key on `metadata.llm_specs`; `min_price`, **`max_price`**, `exclude_category_slug`; `sort` includes `discount`, `value` (savings amount), etc.), `/stores`, `/brands`, `/categories/tree`, `/facets` (`spec_facets`, `brand_facets`, `price_range`), `/spec-values`, `/status`. Deprecated: `/canonical-categories` (use `/categories/tree`)

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

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Data flow, services, component library, **error monitoring (Sentry) policy**, **logging**, Cursor cloud env / Sentry→PR automation
- [docs/DESIGN.md](docs/DESIGN.md) — Visual identity, copy guidelines, "dialed-in" vibe
- [docs/SCRAPING.md](docs/SCRAPING.md) — Parser structure, adding stores
- [docs/TAXONOMY.md](docs/TAXONOMY.md) — Category mappings, LLM classifier
- [docs/ideas/mtbbot-feedback.md](docs/ideas/mtbbot-feedback.md) — Reddit feedback on MTBbot applied to The Dropper (ZAC-93)
- Domain READMEs: [apps/api/README.md](apps/api/README.md), [apps/scraper/README.md](apps/scraper/README.md), [apps/web/README.md](apps/web/README.md), [packages/shared/README.md](packages/shared/README.md)
