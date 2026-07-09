# Architecture

Overview of the MTB aggregator data flow, services, and design decisions.

## System Overview

```mermaid
flowchart LR
    subgraph Scheduler [API Scheduler]
        CronScrape[Scrape Cron]
        CronEnrich[Enrich Cron]
    end
    subgraph Scraper [Scraper Service]
        Playwright[Playwright]
        Parsers[Store Parsers]
    end
    subgraph API [API Service]
        DB[(Postgres)]
        Brand[Brand Normalization]
        Taxonomy[Category Taxonomy]
    end
    subgraph Web [Web App]
        Deals[DealsPage]
        Admin[Admin UI]
    end
    CronScrape --> Scraper
    CronEnrich --> Scraper
    Scraper --> API
    API --> DB
    API --> Brand
    API --> Taxonomy
    Web --> API
```

## Services

| Service   | Stack                                             | Port | Role                                      |
| --------- | ------------------------------------------------- | ---- | ----------------------------------------- |
| API       | Go (net/http, pgx)                                | 8080 | REST API, scheduler, orchestration        |
| Scraper   | Node.js + Express + Playwright                    | 3000 | Scrapes retailer sale pages               |
| Web       | Next.js 15 + React + Tailwind v4 + TanStack Query | 3000 | Public deals UI (SSR/ISR), admin          |
| Storybook | Storybook 8 + Vite                                | 6006 | Component development, design system docs |

## Data Flow

### 1. Scrape Job (every 4h)

1. Scheduler triggers `POST /scrape-now` (or per-store via `?store=xxx`)
2. API iterates stores. **Competitive Cyclist** (`store_type=competitivecyclist`) is ingested inside the API via the **Impact Partner Product Catalog** (HTTP Basic: `IMPACT_ACCOUNT_SID` / `IMPACT_AUTH_TOKEN`) — no Playwright call. All **other** stores call the scraper `POST /scrape` with `url` + `store_type`.
3. Scraper loads Playwright, runs store-specific parser, returns `ScrapeResult[]` (skipped for CC)
4. API upserts listings into `store_listings`, applies brand normalization, extracts metadata, and sets **`affiliate_url`** for **Competitive Cyclist** via `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when configured, otherwise from the Impact catalog **`Url`** when it carries redirect attribution (plain PDP URLs omit **`affiliate_url`**). Public reads prefer **`affiliate_url`** over **`product_url`** for “View deal” CTAs when the column is populated.

**Shopify variants:** For Shopify-based stores, each variant is a row (`store_sku` unique per store). `product_group_key` is `{store_id}:{product_handle}` for grouping; `variant_options` holds option dimensions (e.g. `Size`, `Color`) from the products JSON API. `GET /deals?group_variants=true` returns one representative deal per group with `variants[]`, `variant_count`, and optional `price_range`. Backfill `make backfill-variant-options` (API) primarily paginates each store’s **`stores.scrape_url`** collection **`/products.json`** (same as scrapers), then optionally falls back to **`/products/{handle}.json`** for handles not in that index; see [apps/api/README.md](../apps/api/README.md).

**JensonUSA variants:** Clearance listing cards hydrate `data-product-result-dto` with a `variants` array. The scraper emits one row per variant (`store_sku` = `variant.code`, `product_group_key` = parent `code`) with listing-time `variant_options` (often incomplete vs the PDP). Enrichment calls the scraper’s Jenson PDP parser, which reads `serverSideViewModel.variants` from the HTML and returns structured dimensions plus `is_orderable`; the API applies that to **every** listing row with the same `product_group_key` (deduped: one PDP fetch per parent per batch). Listing prices are not overwritten from the PDP. Migration **`025_jenson_hide_superseded_parent_listings`** hides legacy parent-only rows that share a `product_url` with longer variant SKUs so the deals list does not duplicate products.

**Deals list sorting:** Default when `sort` is omitted is `discount` (highest % off). `GET /deals` also supports `sort=value` (largest savings: `original_price - current_price`), `newest`, `price_asc`/`price_desc`, and `relevance` (with `q`). Filters include `min_price`, **`max_price`**, and `exclude_category_slug` (subtree) for surfacing higher-ticket items on the home page without manual curation; **`max_price`** also powers buyer-intent **SEO hub** pages on the web (`/deals/hub/...`).

**Brand facets:** `GET /facets` `brand_facets` are scoped to the same filters as other facets except all `brand` query params are omitted when aggregating brands (so the deals UI can list alternative brands while one or more are selected).

**Spec facets:** Each `spec_*` facet’s value list is aggregated without applying that key’s own `spec_*` filter (faceted-navigation pattern, same as brands). Repeated `spec_*` values OR within the key.

**Facet listing visibility:** `GET /facets` includes only in-stock listings with `hidden = false`, same as public `GET /deals`, so facet counts cannot reference rows that deals queries exclude.

### 2. Enrich Job (nightly, 2am)

1. Scheduler triggers `POST /enrich-now` (async; returns 202 immediately)
2. API fetches unenriched listings in batches until timeout, backlog drained, or **`ENRICH_MAX_LISTINGS`** cap (if set). Only **in-stock, non-hidden** rows are eligible (same visibility as `GET /deals`).
3. For each store with an enricher in `StoreTypesWithEnrichers` (excludes **Competitive Cyclist** — CC ingest is Impact catalog only; scheduled PDP enrich is skipped because WAF blocks automated scraper access): Scraper visits PDP URLs. CC variant fan-out (`internal/db/cc_pdp_variants.go`) still applies when CC listings are enriched via admin/manual paths or backfill.
4. Parsers extract retailer category hints (e.g. breadcrumbs or Shopify `product_type`) and specs (tables, definition lists, or—for **Revel Bikes**—`<strong>KEY:</strong><br>value` paragraphs in `body_html` from `/products/{handle}.json`)
5. API merges PDP specs into `metadata`, then maps `category_path` through `taxonomy.Map` to set `canonical_category` and `category_id` **unless** the listing already has a confident `metadata.llm_category` (same threshold as the classifier, overridable via `LLM_CATEGORY_PRESERVE_THRESHOLD`) — in that case only `category_path` and `metadata` refresh so a failed LLM step cannot revert a good prior classification.
6. Optional **LLM category classifier** refines `canonical_category` / `category_id` when enabled; then optional **LLM spec extraction** runs per `llm_prompt_profiles`.

**LLM specs without PDP:** For profile iteration or backlog fixes without re-scraping PDPs, operators can trigger the same classify + extract sequence **against existing row data only** (`product_name`, `metadata.specs`, `metadata.description`, `canonical_category`, etc.—no scraper `/enrich` call). `POST /llm-specs-now` (cron-authenticated like scrape/enrich) creates an **`enrich_jobs` row with `job_type=llm_specs`** and processes listings in batches. Admin also exposes **`POST /admin/listings/bulk-llm-specs`** and **`POST /admin/listings/:id/llm-specs`**. The scheduled nightly enrich flow above stays the default source of PDP + LLM for new/changed catalogue rows.

**LLM extraction profiles:** For each category, `llm_prompt_profiles` drives structured spec extraction. When migration `019` composition rows exist (`llm_prompt_profile_fields`), the API **hydrates** `extraction_schema` at read time from `llm_extraction_field_defs` plus per-profile overrides (and appends `confidence` when not composed). If there are no composition rows, the stored `extraction_schema` JSONB is used unchanged.

**Inheritance (category tree):** On hot paths `GetLLMPromptProfileForCategory` and `GetLLMPromptProfileForCategoryID`, the API builds an **effective** extraction schema by merging **enabled** profiles along the path from the **category root to the leaf** (in order). A field `key` defined on a **deeper** category **replaces** the same key from an ancestor (child wins). `system_prompt`, profile `name`, and admin-facing identity use the **nearest enabled** profile to the leaf (most specific). A single `confidence` field is appended after the merge (same source as composition hydration). `GetLLMPromptProfileByID` still loads one stored profile (for editing); `GET /admin/llm-profiles/:id` includes **`effective_extraction_schema`** when `category_id` is set so operators can preview the merged schema. Listings that match a legacy profile row only via `canonical_category` text (no resolved `category_id`) use that row without ancestor merge.

Hot paths (`GetLLMPromptProfileForCategory*`, `GetLLMPromptProfileByID`) hydrate per-profile JSON when composition rows exist; `ListLLMPromptProfiles` keeps raw JSON for the admin table.

**Admin field library:** `GET/POST /admin/llm-extraction-field-defs` and `GET/PUT/DELETE /admin/llm-extraction-field-defs/:id` CRUD the global defs. `GET /admin/llm-profiles/:id` includes `profile_fields` when composition exists, and **`effective_extraction_schema`** when `category_id` is set (merged ancestor + node schema for runtime). `PUT /admin/llm-profiles/:id` accepts optional `profile_fields` to replace composition; clients must not send `extraction_schema` when also sending `profile_fields`, or when the profile already has composition rows (update meta only, or change schema via `profile_fields`). The web admin **LLM Profiles** page (`/admin/llm-profiles`) exposes a **Field library** tab plus a composition editor for profiles with rows; profiles still on raw JSON can switch to composition or clear composition to return to JSON editing.

### 3. Category Taxonomy

- **Structured tree**: `categories` table (id, slug, name, parent_id, optional `description` for LLM rubrics — migration `023`) — single source of truth
- **Listings**: `store_listings.category_id` FK ties each listing to the structured tree and drives public filtering (`GET /deals?category_slug=` uses subtree IDs). `canonical_category` (`text[]`) is a denormalized taxonomy path that usually mirrors that FK but can drift when enrichment/classifier/scrape paths disagree or when `UpsertListing` preserves an older `category_id`. The admin Data Browser supports **`category_slug`** (matches `/deals`) and **`canonical_category`** (exact array match) so drift is visible.
- **Mappings**: `category_mappings` map raw store paths (e.g. `["Components", "Brakes"]`) to `category_id`
- **LLM classifier**: Optional LLM-based classification; valid outputs are paths from the live tree; non-empty per-category `description` values are appended to the classifier user prompt as “Category definitions” (distinct from public SEO copy in the web app)

## Key Directories

| Path                            | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `apps/api/internal/scheduler/`  | Cron jobs, scrape/enrich orchestration                                         |
| `apps/api/internal/llmlisting/` | LLM classify + spec extraction pipeline shared by enrichment and LLM-only jobs |
| `apps/api/internal/db/`         | All pgx queries                                                                |
| `apps/api/internal/brand/`      | Brand aliases normalization                                                    |
| `apps/api/internal/taxonomy/`   | Category mapping, in-memory cache                                              |
| `apps/api/internal/metadata/`   | Spec extraction from enriched data                                             |
| `apps/scraper/src/parsers/`     | One parser per store                                                           |
| `apps/web/src/components/ui/`   | shadcn primitives (Button, Input, Card, Drawer/Vaul, etc.)                     |
| `apps/web/src/components/`      | Composed components (DealCard, CategoryCard, Pagination, etc.)                 |
| `apps/web/.storybook/`          | Storybook config, preview decorators                                           |

## Component Library

The web app uses a design system built on **shadcn/ui** and **Tailwind v4** for visual consistency. See [docs/DESIGN.md](DESIGN.md) for visual identity, copy guidelines, and the "dialed-in" vibe.

### Primitives (`src/components/ui/`)

- **Button** — Primary, outline, secondary, ghost, destructive, link variants
- **Input** — Text, search, number, password
- **Card** — CardHeader, CardTitle, CardDescription, CardContent, CardFooter

Add new primitives via `pnpm dlx shadcn@latest add <component>` in `apps/web`.

### Theming

- **CSS variables** in `src/app/globals.css` (`:root`, `.dark`) — `--app-font-sans`, `--app-font-display`, `--primary`, `--background`, etc. (`@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/bricolage-grotesque`).
- **Tailwind @theme** — Maps variables to utilities (`bg-primary`, `text-muted-foreground`)
- **Dark mode** — Class-based (`dark` on ancestor); toggle in Storybook toolbar

### Storybook

- **Run**: `pnpm --filter @mtb-aggregator/web run storybook` (port 6006)
- **Build**: `pnpm --filter @mtb-aggregator/web run build-storybook`
- **Stories**: `*.stories.tsx` next to components; use CSF3 format
- **Theme toolbar**: Light/dark toggle for palette iteration
- **Design tokens**: See **Design / Design Tokens** for the palette (Carbon Grey, Mud/Deep Forest, Hazard Orange) and typography. [docs/DESIGN.md](DESIGN.md)

### Composed Components

High-level components (DealCard, CategoryCard, Pagination, SearchBar, FilterSelect) use the primitives. When adding or changing UI, prefer primitives over raw HTML and add Storybook stories.

### SEO (metadata)

The web app sets `metadataBase`, default Open Graph/Twitter fields (including a default OG image via `the-dropper-logo-horizontal.png`), and `robots` in [`apps/web/src/app/layout.tsx`](apps/web/src/app/layout.tsx). [`apps/web/src/lib/siteUrl.ts`](apps/web/src/lib/siteUrl.ts) resolves the public origin from `NEXT_PUBLIC_SITE_URL`. On **Vercel Production**, `NEXT_PUBLIC_SITE_URL` is required — the app throws at runtime if it is missing (falling back to `VERCEL_URL` would use the deployment hostname and break canonicals and sitemap URLs). **Vercel Preview** uses `VERCEL_URL` when unset. Local dev defaults to `http://localhost:3000`. Home, `/deals`, and `/categories` export static `metadata`; deal detail, `/deals/c/[...slug]`, and **`/deals/hub/[slug]`** use `generateMetadata` with canonical URLs (hubs use `noindex` when inventory is below the curated threshold). Deal detail uses `openGraph.type: "article"` and prefers the listing `image_url` for OG/Twitter, falling back to the site wordmark when absent.

**JSON-LD** — [`apps/web/src/components/JsonLd.tsx`](apps/web/src/components/JsonLd.tsx) + [`apps/web/src/lib/jsonLd.ts`](apps/web/src/lib/jsonLd.ts): home emits `WebSite` + `SearchAction` (deals search) and an `ItemList` for featured deals; `/deals` emits `BreadcrumbList` + `ItemList` (same cap as category lists); **`/deals/hub/[slug]`** emits `BreadcrumbList` + `ItemList`; `/categories` emits a `CollectionPage` hub with `hasPart` linking to each top-level department’s `/deals/c/...` URL; deal detail emits `BreadcrumbList`, `Product` + `Offer`; category deal routes emit `BreadcrumbList` + `ItemList` (first 12 URLs, `numberOfItems` = total matching).

**GEO / AI discovery** — Static [`apps/web/public/llms.txt`](apps/web/public/llms.txt) and [`apps/web/public/llms-full.txt`](apps/web/public/llms-full.txt) summarize the site for crawlers and assistants.

**Sitemap / robots** — [`apps/web/src/app/sitemap.ts`](apps/web/src/app/sitemap.ts) and [`apps/web/src/app/robots.ts`](apps/web/src/app/robots.ts). Sitemap includes static routes (including `/categories`), category paths from `GET /categories/tree` **only for nodes with `deal_count` > 0** (subtree rollup of in-stock, visible listings), **curated `/deals/hub/...` URLs** when live inventory meets a minimum threshold (same rule as `robots` indexing for those pages), and paginated deal detail URLs (capped). Empty category routes get `noindex` via metadata. **Middleware** [`apps/web/src/middleware.ts`](apps/web/src/middleware.ts): `308` from `/deals?category=` to `/deals/c/...` for canonical category URLs.

**Category intros & deal breadcrumbs** — Category routes pass `getCategorySeo().intro` into [`DealsPageContent`](apps/web/src/views/DealsPageContent.tsx). Deal detail uses [`categorySlugFromCanonicalPath`](apps/web/src/lib/categoryTree.ts) and [`categoryPathLabelFromSlug`](apps/web/src/lib/categoryTree.ts) to link to `/deals/c/...` when `canonical_category` matches the tree.

## Analytics

The web app uses [Vercel Web Analytics](https://vercel.com/docs/analytics) via `@vercel/analytics`. Enable Web Analytics in the Vercel project dashboard (Analytics → Enable) after deploying. Page views and visitors are tracked automatically.

**Custom events** (require Vercel Pro or an alternative such as PostHog) are wired via `track()` and/or `posthog.capture()` in [DealCard](apps/web/src/components/DealCard.tsx), [DealDetailModal](apps/web/src/components/DealDetailModal.tsx), [DealFilters](apps/web/src/components/DealFilters.tsx), [SearchBar](apps/web/src/components/SearchBar.tsx), [DealsPageContent](apps/web/src/views/DealsPageContent.tsx), and related components:

- `deal_card_click` — user opens deal modal (deal_id, store, brand)
- `view_deal` / `view_at_store` — user clicks through to retailer (deal_id, store, brand)
- `filter_applied` — store, brand, category, sort, min_discount, or spec (type, value). For **category**, PostHog also sends `nav_source` (`breadcrumb` | `chip` | `all_clear`) and `category_slug` when applicable
- `search` — search query (debounced)

See [.cursor/plans/website_analytics_plan_f835d1a0.plan.md](../.cursor/plans/website_analytics_plan_f835d1a0.plan.md) for details and alternatives.

## CI security checks

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

| Step                                                                 | Purpose                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gitleaks**                                                         | Secret scanning on the repo history / PR diff (full PR commit range). Scraper fixtures path is allowlisted in [`.gitleaks.toml`](../.gitleaks.toml); still sanitize live third-party keys before first push (see [docs/SCRAPING.md](SCRAPING.md#test-fixtures-and-ci-gitleaks)). |
| **`pnpm audit --audit-level=high`**                                  | npm advisory database; fails on high/critical (moderate/low do not block)                                                                                                                                                                            |
| **`next lint` + `tsc --noEmit`**                                     | ESLint (including `eslint-plugin-security` rules) and TypeScript for the web app                                                                                                                                                                     |
| **`go vet`**, **staticcheck** (`v0.7.0`), **govulncheck** (`v1.2.0`) | Go correctness and known-vulnerability checks on reachable code paths                                                                                                                                                                                |
| **SEO smoke** (`pnpm --filter @mtb-aggregator/web run seo:smoke`)    | Asserts JSON-LD builder output invariants (no running server)                                                                                                                                                                                        |
| **Lighthouse CI**                                                    | Runs when repository **Variables** include `API_URL` (same as web build): starts `next start` after the web build and asserts Lighthouse **SEO** category ≥ 0.85 on `/` and `/deals` ([`apps/web/lighthouserc.json`](../apps/web/lighthouserc.json)) |
| **Unit tests**                                                       | `go test ./...` (API), `pnpm --filter @mtb-aggregator/web run test`, `@mtb-aggregator/logging` and `@mtb-aggregator/scraper` Vitest suites                                                                                                                                                                            |
| **API + web build**                                                  | Compile API binary and Next.js production build                                                                                                                                                                                                      |

The CI workflow sets `permissions: contents: read` and `pull-requests: read` so `GITHUB_TOKEN` can list PR commits for **gitleaks** (without this, `pull_request` runs can fail with HTTP 403 from the GitHub API).

**Go patch version:** [`apps/api/go.mod`](../apps/api/go.mod) sets `toolchain go1.25.12` so local and CI builds use a stdlib that satisfies **govulncheck** (security fixes land in patch releases; pinning only `go 1.25` is not enough). CI uses Go **1.25.12**; the API **Dockerfile** uses `golang:1.25.12-alpine`.

**Dependency hygiene:** Root `package.json` defines `pnpm.overrides` to align transitive packages with patched versions where advisories affected nested dependencies; keep overrides minimal and revisit when upgrading direct deps.

**Scheduled scans:** `.github/workflows/docker-security-scan.yml` builds API and scraper images weekly and runs **Trivy** on `HIGH`/`CRITICAL` CVEs. **Dependabot** (`.github/dependabot.yml`) opens weekly/monthly PRs for npm, Go modules, Docker base images, and GitHub Actions.

## Environment & Deployment

- **Local**: Docker Postgres, three terminals (scraper, API, web)
- **Production**: Neon (DB), Render (API + scraper), Vercel (web), external cron (cron-job.org)

**Custom domain (Vercel):** Add apex/`www` under the Vercel project’s **Domains** settings and create the DNS records your registrar (e.g. Porkbun) requires—Vercel shows the exact records. The web app’s `NEXT_PUBLIC_API_URL` stays pointed at the API host (e.g. Render), not the new domain. If `CORS_ORIGINS` on the API is a comma-separated allowlist instead of `*`, add each browser origin you use (`https://yourdomain.com`, `https://www.yourdomain.com` if applicable). Details: [apps/web/README.md](../apps/web/README.md#custom-domain-vercel--dns-at-porkbun-or-any-registrar).

**In-process scheduler (`SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC`):** The API runs `robfig/cron` in the same process. Cron uses the container’s local timezone (typically UTC on hosts like Render). **Startup catch-up:** When either cron is enabled (not `disabled`), each process start checks `scrape_jobs` / `enrich_jobs` for the most recent job start; if older than 24h or absent, it runs that job once in the background (`triggered_by=catch-up`) so a missed window after a restart/deploy is recovered without external cron. **Enrich job bookkeeping:** terminal `enrich_jobs` updates (`completed`, `timed_out`, `failed`) use a short detached database context so timeouts still persist if the job’s work context is already canceled (avoids rows stuck `running` until the next deploy).

**Cron triggers (`POST /scrape-now`, `POST /enrich-now`, `POST /llm-specs-now`):** Set `CRON_SECRET` and send `X-Cron-Secret` from the cron provider. In production (`APP_ENV=production` or `RENDER=true`), if `CRON_SECRET` is unset, unauthenticated requests are rejected (admin Bearer still works); local dev allows open triggers when the secret is unset. Escape hatch: `ALLOW_OPEN_CRON=1` (not recommended).

**Scraper service (`POST /scrape`, `POST /enrich`):** Set `SCRAPER_SERVICE_SECRET` to the same value on the API and the scraper. The API sends `X-Scraper-Secret`; the scraper rejects requests without it when the env var is set. `GET /health` remains unauthenticated. If the scraper is only reachable on a private network, you may still set the secret for defense in depth.

**Admin login (`POST /admin/auth`):** Failed password attempts are rate-limited per client IP (defaults: 5 failures per 15 minutes, then HTTP 429 with `Retry-After`). Uses `X-Forwarded-For` / `X-Real-IP` when present. Tune with `ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW`, `ADMIN_AUTH_WINDOW_SECONDS`; set `ADMIN_AUTH_RATE_LIMIT=off` only for local development.

See [README.md](../README.md) for setup and [.cursor/plans/mtb_aggregator_deployment.plan.md](../.cursor/plans/mtb_aggregator_deployment.plan.md) for deployment details.

### Logging

All services emit **JSON log lines** to stdout with shared fields (`ts`, `level`, `service`, `component`, `msg`). On Render/Vercel, **platform HTTP access logs are not duplicated** by the app when `LOG_HTTP_ACCESS=auto` (default). Tune with `LOG_LEVEL`, `LOG_FORMAT`, and `LOG_HTTP_ACCESS`. Full schema and Render filter tips: [docs/LOGGING.md](LOGGING.md).

### Error monitoring (Sentry)

#### Policy: report significant errors to Sentry

**Deployed environments (Render, Vercel, etc.) should set the Sentry DSN** so failures are visible. When a DSN is set, **do not rely on logs alone** for errors that indicate a bug, outage, or broken integration—**send them to Sentry** as well.

| Do report                                                                                              | Usually do not report                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 5xx, panics, timeouts, scraper/enrich job failures, strict validation abort, consecutive empty scrapes | Expected 4xx, auth failures, “not found” for valid clients                            |
| Handled errors where you return 500/503 but the request didn’t panic                                   | High-volume per-item failures unless sampled or aggregated (see scheduler note below) |

Local development may omit DSN to avoid noise; production/staging should not.

#### When adding or changing code

- **API (HTTP)** — `sentry-go/http` in [apps/api/main.go](apps/api/main.go) covers panics and typical server errors on the request path. If a handler catches an error and responds with 5xx **without** re-panicking, add `sentry.CaptureException(err)` (or a small helper) so Sentry still sees it.
- **API (background)** — Scrape/enrich and other goroutines **off** the HTTP path must use [apps/api/internal/sentryutil](apps/api/internal/sentryutil) (`CaptureError`, `CapturePanicValue`, `CaptureWarning`) for job-level issues; follow patterns in [apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go). **Set `SENTRY_DSN` on the API in production** — without it, all `sentryutil` calls are no-ops. Completed enrich jobs with many listing failures send one aggregated event (`phase=listing_errors_aggregate`, threshold ≥5 errors or >50% failure rate). Enrichment LLM failures (OpenAI classify/extract) are reported with tags `phase=classify|extract`, `llm_error=quota_exhausted|other`; **quota exhaustion** is captured once per job and remaining listings skip LLM for that run; other LLM errors are capped (first N per job) to avoid flooding.
- **Web** — `@sentry/nextjs` captures many unhandled errors; [apps/web/src/app/global-error.tsx](apps/web/src/app/global-error.tsx) reports root render failures. If you `try/catch` and show a fatal UI without rethrowing, call `Sentry.captureException` in the catch path.
- **Scraper** — New Express routes: use `captureRouteError` in `catch` (see [apps/scraper/src/server.ts](apps/scraper/src/server.ts)) and keep `Sentry.setupExpressErrorHandler` last.

Document intentional omissions (e.g. high-volume per-listing paths) in PRs or here if the behavior changes.

#### Current wiring

- **API** — When `SENTRY_DSN` is set (**required in production**): [apps/api/main.go](apps/api/main.go), `sentry-go/http` for panics and HTTP errors. Scheduler uses `sentryutil` for job-level failures, panics, strict validation abort, timeouts, consecutive empty scrape warning, **aggregated listing enrich errors** on completed jobs, plus **LLM classify/extract** errors (sampled/capped per job for non-quota errors). Scraper client includes scraper 500 `message` in API errors when present. Admin `POST /admin/listings/:id/enrich` and **`POST /admin/listings/:id/llm-specs`** report LLM failures to Sentry when classify/extract errors occur. Release: `SENTRY_RELEASE` or `RENDER_GIT_COMMIT`.
- **Web** — When `NEXT_PUBLIC_SENTRY_DSN` is set: `@sentry/nextjs` with `src/instrumentation.ts`, `instrumentation-client.ts`, server/edge configs, and `src/app/global-error.tsx`. Release/environment: `SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA` and `SENTRY_ENVIRONMENT` / `VERCEL_ENV`, with client-side values wired through [apps/web/next.config.ts](apps/web/next.config.ts). Optional `SENTRY_AUTH_TOKEN` + org/project for source maps on build.
- **Scraper** — When `SENTRY_DSN` is set: [apps/scraper/src/bootstrap.ts](apps/scraper/src/bootstrap.ts) (init before Express), [apps/scraper/src/server.ts](apps/scraper/src/server.ts) (`setupExpressErrorHandler`, `captureRouteError` on `/scrape`, `/enrich`, `/scrape-debug`). Release: `SENTRY_RELEASE` or `RENDER_GIT_COMMIT`.

Configure alerts in each Sentry project (email, Slack, etc.).

## Agent tooling (Cursor)

- **Project rules (automatic):** [`.cursor/rules/*.mdc`](../.cursor/rules/) — `alwaysApply` and path `globs` only on these `.mdc` files.
- **Workflow playbooks (manual):** [`.agents/skills/workflows/`](../.agents/skills/workflows/README.md) — longer process skills; invoke with `@` when needed. Meta index: [`using-agent-skills/SKILL.md`](../.agents/skills/workflows/using-agent-skills/SKILL.md).
- **Repo overview for agents:** [`CLAUDE.md`](../CLAUDE.md) at the repository root.
