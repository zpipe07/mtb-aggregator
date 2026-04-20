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

| Service | Stack | Port | Role |
|---------|-------|------|------|
| API | Go (net/http, pgx) | 8080 | REST API, scheduler, orchestration |
| Scraper | Node.js + Express + Playwright | 3000 | Scrapes retailer sale pages |
| Web | Next.js 15 + React + Tailwind v4 + TanStack Query | 3000 | Public deals UI (SSR/ISR), admin |
| Storybook | Storybook 8 + Vite | 6006 | Component development, design system docs |

## Data Flow

### 1. Scrape Job (every 4h)

1. Scheduler triggers `POST /scrape-now` (or per-store via `?store=xxx`)
2. API iterates stores, calls Scraper `POST /scrape` with `url` + `store_type`
3. Scraper loads Playwright, runs store-specific parser, returns `ScrapeResult[]`
4. API upserts listings into `store_listings`, applies brand normalization, extracts metadata

**Shopify variants:** For Shopify-based stores, each variant is a row (`store_sku` unique per store). `product_group_key` is `{store_id}:{product_handle}` for grouping; `variant_options` holds option dimensions (e.g. `Size`, `Color`) from the products JSON API. `GET /deals?group_variants=true` returns one representative deal per group with `variants[]`, `variant_count`, and optional `price_range`; `GET /facets` includes `variant_facets` for sidebar filters. `variant_<Key>=` query params filter on `variant_options` (key matched case-insensitively). Backfill `make backfill-variant-options` (API) primarily paginates each store’s **`stores.scrape_url`** collection **`/products.json`** (same as scrapers), then optionally falls back to **`/products/{handle}.json`** for handles not in that index; see [apps/api/README.md](../apps/api/README.md).

**Deals list sorting:** `GET /deals` supports `sort=discount` (highest % off), `sort=value` (largest savings: `original_price - current_price`), plus `newest`, `price_asc`/`price_desc`, and `relevance` (with `q`). Filters include `min_price` and `exclude_category_slug` (subtree) for surfacing higher-ticket items on the home page without manual curation.

**Brand facets:** `GET /facets` `brand_facets` are scoped to the same filters as other facets except the `brand` query param is omitted when aggregating brands (so the deals UI can list alternative brands while one is selected).

**Spec and variant facets:** Each `spec_*` facet’s value list is aggregated without applying that key’s own `spec_*` filter; each variant dimension’s value list omits that dimension’s `variant_*` filter (same faceted-navigation pattern as brands).

### 2. Enrich Job (nightly, 2am)

1. Scheduler triggers `POST /enrich-now`
2. API fetches unenriched listings, groups by store
3. For each store with an enricher: Scraper visits PDP (product detail page) URLs
4. Parsers extract category path (breadcrumbs), specs (wheel size, travel, etc.)
5. API merges PDP specs into `metadata`, then maps `category_path` through `taxonomy.Map` to set `canonical_category` and `category_id` **unless** the listing already has a confident `metadata.llm_category` (same threshold as the classifier, overridable via `LLM_CATEGORY_PRESERVE_THRESHOLD`) — in that case only `category_path` and `metadata` refresh so a failed LLM step cannot revert a good prior classification.
6. Optional **LLM category classifier** refines `canonical_category` / `category_id` when enabled; then optional **LLM spec extraction** runs per `llm_prompt_profiles`.

**LLM extraction profiles:** For each category, `llm_prompt_profiles` drives structured spec extraction. When migration `019` composition rows exist (`llm_prompt_profile_fields`), the API **hydrates** `extraction_schema` at read time from `llm_extraction_field_defs` plus per-profile overrides (and appends `confidence` when not composed). If there are no composition rows, the stored `extraction_schema` JSONB is used unchanged. Hot paths (`GetLLMPromptProfileForCategory*`, `GetLLMPromptProfileByID`) hydrate; `ListLLMPromptProfiles` keeps raw JSON for the admin table.

**Admin field library:** `GET/POST /admin/llm-extraction-field-defs` and `GET/PUT/DELETE /admin/llm-extraction-field-defs/:id` CRUD the global defs. `GET /admin/llm-profiles/:id` includes `profile_fields` when composition exists. `PUT /admin/llm-profiles/:id` accepts optional `profile_fields` to replace composition; clients must not send `extraction_schema` when also sending `profile_fields`, or when the profile already has composition rows (update meta only, or change schema via `profile_fields`). The web admin **LLM Profiles** page (`/admin/llm-profiles`) exposes a **Field library** tab plus a composition editor for profiles with rows; profiles still on raw JSON can switch to composition or clear composition to return to JSON editing.

### 3. Category Taxonomy

- **Structured tree**: `categories` table (id, slug, name, parent_id, optional `description` for LLM rubrics — migration `023`) — single source of truth
- **Mappings**: `category_mappings` map raw store paths (e.g. `["Components", "Brakes"]`) to `category_id`
- **LLM classifier**: Optional LLM-based classification; valid outputs are paths from the live tree; non-empty per-category `description` values are appended to the classifier user prompt as “Category definitions” (distinct from public SEO copy in the web app)

## Key Directories

| Path | Purpose |
|------|---------|
| `apps/api/internal/scheduler/` | Cron jobs, scrape/enrich orchestration |
| `apps/api/internal/db/` | All pgx queries |
| `apps/api/internal/brand/` | Brand aliases normalization |
| `apps/api/internal/taxonomy/` | Category mapping, in-memory cache |
| `apps/api/internal/metadata/` | Spec extraction from enriched data |
| `apps/scraper/src/parsers/` | One parser per store |
| `apps/web/src/components/ui/` | shadcn primitives (Button, Input, Card, Drawer/Vaul, etc.) |
| `apps/web/src/components/` | Composed components (DealCard, CategoryCard, Pagination, etc.) |
| `apps/web/.storybook/` | Storybook config, preview decorators |

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

High-level components (DealCard, CategoryCard, Pagination, SearchBar, FilterInput) use the primitives. When adding or changing UI, prefer primitives over raw HTML and add Storybook stories.

### SEO (metadata)

The web app sets `metadataBase`, default Open Graph/Twitter fields (including a default OG image via `the-dropper-logo-horizontal.png`), and `robots` in [`apps/web/src/app/layout.tsx`](apps/web/src/app/layout.tsx). [`apps/web/src/lib/siteUrl.ts`](apps/web/src/lib/siteUrl.ts) resolves the public origin from `NEXT_PUBLIC_SITE_URL`. On **Vercel Production**, `NEXT_PUBLIC_SITE_URL` is required — the app throws at runtime if it is missing (falling back to `VERCEL_URL` would use the deployment hostname and break canonicals and sitemap URLs). **Vercel Preview** uses `VERCEL_URL` when unset. Local dev defaults to `http://localhost:3000`. Home, `/deals`, and `/categories` export static `metadata`; deal detail and `/deals/c/[...slug]` use `generateMetadata` with canonical URLs. Deal detail uses `openGraph.type: "article"` and prefers the listing `image_url` for OG/Twitter, falling back to the site wordmark when absent.

**JSON-LD** — [`apps/web/src/components/JsonLd.tsx`](apps/web/src/components/JsonLd.tsx) + [`apps/web/src/lib/jsonLd.ts`](apps/web/src/lib/jsonLd.ts): home emits `WebSite` + `SearchAction` (deals search) and an `ItemList` for featured deals; `/deals` emits `BreadcrumbList` + `ItemList` (same cap as category lists); `/categories` emits a `CollectionPage` hub with `hasPart` linking to each top-level department’s `/deals/c/...` URL; deal detail emits `BreadcrumbList`, `Product` + `Offer`; category deal routes emit `BreadcrumbList` + `ItemList` (first 12 URLs, `numberOfItems` = total matching).

**GEO / AI discovery** — Static [`apps/web/public/llms.txt`](apps/web/public/llms.txt) and [`apps/web/public/llms-full.txt`](apps/web/public/llms-full.txt) summarize the site for crawlers and assistants.

**Sitemap / robots** — [`apps/web/src/app/sitemap.ts`](apps/web/src/app/sitemap.ts) and [`apps/web/src/app/robots.ts`](apps/web/src/app/robots.ts). Sitemap includes static routes (including `/categories`), category paths from `GET /categories/tree` **only for nodes with `deal_count` > 0** (subtree rollup of in-stock, visible listings), and paginated deal detail URLs (capped). Empty category routes get `noindex` via metadata. **Middleware** [`apps/web/src/middleware.ts`](apps/web/src/middleware.ts): `308` from `/deals?category=` to `/deals/c/...` for canonical category URLs.

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

| Step | Purpose |
|------|---------|
| **gitleaks** | Secret scanning on the repo history / PR diff |
| **`pnpm audit --audit-level=high`** | npm advisory database; fails on high/critical (moderate/low do not block) |
| **`next lint` + `tsc --noEmit`** | ESLint (including `eslint-plugin-security` rules) and TypeScript for the web app |
| **`go vet`**, **staticcheck** (`v0.7.0`), **govulncheck** (`v1.2.0`) | Go correctness and known-vulnerability checks on reachable code paths |
| **SEO smoke** (`pnpm --filter @mtb-aggregator/web run seo:smoke`) | Asserts JSON-LD builder output invariants (no running server) |
| **Lighthouse CI** | Runs when repository **Variables** include `API_URL` (same as web build): starts `next start` after the web build and asserts Lighthouse **SEO** category ≥ 0.85 on `/` and `/deals` ([`apps/web/lighthouserc.json`](../apps/web/lighthouserc.json)) |
| **Scraper tests**, **API + web build** | Existing quality gates |

The CI workflow sets `permissions: contents: read` and `pull-requests: read` so `GITHUB_TOKEN` can list PR commits for **gitleaks** (without this, `pull_request` runs can fail with HTTP 403 from the GitHub API).

**Go patch version:** [`apps/api/go.mod`](../apps/api/go.mod) sets `toolchain go1.25.9` so local and CI builds use a stdlib that satisfies **govulncheck** (security fixes land in patch releases; pinning only `go 1.25` is not enough). CI uses Go **1.25.9**; the API **Dockerfile** uses `golang:1.25.9-alpine`.

**Dependency hygiene:** Root `package.json` defines `pnpm.overrides` to align transitive packages with patched versions where advisories affected nested dependencies; keep overrides minimal and revisit when upgrading direct deps.

**Scheduled scans:** `.github/workflows/docker-security-scan.yml` builds API and scraper images weekly and runs **Trivy** on `HIGH`/`CRITICAL` CVEs. **Dependabot** (`.github/dependabot.yml`) opens weekly/monthly PRs for npm, Go modules, Docker base images, and GitHub Actions.

## Environment & Deployment

- **Local**: Docker Postgres, three terminals (scraper, API, web)
- **Production**: Neon (DB), Render (API + scraper), Vercel (web), external cron (cron-job.org)

**Custom domain (Vercel):** Add apex/`www` under the Vercel project’s **Domains** settings and create the DNS records your registrar (e.g. Porkbun) requires—Vercel shows the exact records. The web app’s `NEXT_PUBLIC_API_URL` stays pointed at the API host (e.g. Render), not the new domain. If `CORS_ORIGINS` on the API is a comma-separated allowlist instead of `*`, add each browser origin you use (`https://yourdomain.com`, `https://www.yourdomain.com` if applicable). Details: [apps/web/README.md](../apps/web/README.md#custom-domain-vercel--dns-at-porkbun-or-any-registrar).

**In-process scheduler (`SCRAPE_CRON_SPEC` / `ENRICH_CRON_SPEC`):** The API runs `robfig/cron` in the same process. Cron uses the container’s local timezone (typically UTC on hosts like Render). **Startup catch-up:** When either cron is enabled (not `disabled`), each process start checks `scrape_jobs` / `enrich_jobs` for the most recent job start; if older than 24h or absent, it runs that job once in the background (`triggered_by=catch-up`) so a missed window after a restart/deploy is recovered without external cron.

**Cron triggers (`POST /scrape-now`, `POST /enrich-now`):** Set `CRON_SECRET` and send `X-Cron-Secret` from the cron provider. In production (`APP_ENV=production` or `RENDER=true`), if `CRON_SECRET` is unset, unauthenticated requests are rejected (admin Bearer still works); local dev allows open triggers when the secret is unset. Escape hatch: `ALLOW_OPEN_CRON=1` (not recommended).

**Scraper service (`POST /scrape`, `POST /enrich`):** Set `SCRAPER_SERVICE_SECRET` to the same value on the API and the scraper. The API sends `X-Scraper-Secret`; the scraper rejects requests without it when the env var is set. `GET /health` remains unauthenticated. If the scraper is only reachable on a private network, you may still set the secret for defense in depth.

**Admin login (`POST /admin/auth`):** Failed password attempts are rate-limited per client IP (defaults: 5 failures per 15 minutes, then HTTP 429 with `Retry-After`). Uses `X-Forwarded-For` / `X-Real-IP` when present. Tune with `ADMIN_AUTH_MAX_ATTEMPTS_PER_WINDOW`, `ADMIN_AUTH_WINDOW_SECONDS`; set `ADMIN_AUTH_RATE_LIMIT=off` only for local development.

See [README.md](../README.md) for setup and [.cursor/plans/mtb_aggregator_deployment.plan.md](../.cursor/plans/mtb_aggregator_deployment.plan.md) for deployment details.

### Error monitoring (Sentry)

#### Policy: report significant errors to Sentry

**Deployed environments (Render, Vercel, etc.) should set the Sentry DSN** so failures are visible. When a DSN is set, **do not rely on logs alone** for errors that indicate a bug, outage, or broken integration—**send them to Sentry** as well.

| Do report | Usually do not report |
|-----------|------------------------|
| 5xx, panics, timeouts, scraper/enrich job failures, strict validation abort, consecutive empty scrapes | Expected 4xx, auth failures, “not found” for valid clients |
| Handled errors where you return 500/503 but the request didn’t panic | High-volume per-item failures unless sampled or aggregated (see scheduler note below) |

Local development may omit DSN to avoid noise; production/staging should not.

#### When adding or changing code

- **API (HTTP)** — `sentry-go/http` in [apps/api/main.go](apps/api/main.go) covers panics and typical server errors on the request path. If a handler catches an error and responds with 5xx **without** re-panicking, add `sentry.CaptureException(err)` (or a small helper) so Sentry still sees it.
- **API (background)** — Scrape/enrich and other goroutines **off** the HTTP path must use [apps/api/internal/sentryutil](apps/api/internal/sentryutil) (`CaptureError`, `CapturePanicValue`, `CaptureWarning`) for job-level issues; follow patterns in [apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go). Enrichment LLM failures (OpenAI classify/extract) are reported with tags `phase=classify|extract`, `llm_error=quota_exhausted|other`; **quota exhaustion** is captured once per job and remaining listings skip LLM for that run; other LLM errors are capped (first N per job) to avoid flooding.
- **Web** — `@sentry/nextjs` captures many unhandled errors; [apps/web/src/app/global-error.tsx](apps/web/src/app/global-error.tsx) reports root render failures. If you `try/catch` and show a fatal UI without rethrowing, call `Sentry.captureException` in the catch path.
- **Scraper** — New Express routes: use `captureRouteError` in `catch` (see [apps/scraper/src/server.ts](apps/scraper/src/server.ts)) and keep `Sentry.setupExpressErrorHandler` last.

Document intentional omissions (e.g. high-volume per-listing paths) in PRs or here if the behavior changes.

#### Current wiring

- **API** — When `SENTRY_DSN` is set: [apps/api/main.go](apps/api/main.go), `sentry-go/http` for panics and HTTP errors. Scheduler uses `sentryutil` for job-level failures, panics, strict validation abort, timeouts, consecutive empty scrape warning, plus **LLM classify/extract** errors (sampled/capped per job for non-quota errors). Admin `POST /admin/listings/:id/enrich` reports LLM failures to Sentry when classify/extract errors occur. Release: `SENTRY_RELEASE` or `RENDER_GIT_COMMIT`.
- **Web** — When `NEXT_PUBLIC_SENTRY_DSN` is set: `@sentry/nextjs` with `src/instrumentation.ts`, `instrumentation-client.ts`, server/edge configs, and `src/app/global-error.tsx`. Release/environment: `SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA` and `SENTRY_ENVIRONMENT` / `VERCEL_ENV`, with client-side values wired through [apps/web/next.config.ts](apps/web/next.config.ts). Optional `SENTRY_AUTH_TOKEN` + org/project for source maps on build.
- **Scraper** — When `SENTRY_DSN` is set: [apps/scraper/src/bootstrap.ts](apps/scraper/src/bootstrap.ts) (init before Express), [apps/scraper/src/server.ts](apps/scraper/src/server.ts) (`setupExpressErrorHandler`, `captureRouteError` on `/scrape`, `/enrich`, `/scrape-debug`). Release: `SENTRY_RELEASE` or `RENDER_GIT_COMMIT`.

Configure alerts in each Sentry project (email, Slack, etc.).

## Agent tooling (Cursor)

- **Project rules (automatic):** [`.cursor/rules/*.mdc`](../.cursor/rules/) — `alwaysApply` and path `globs` only on these `.mdc` files.
- **Workflow playbooks (manual):** [`.agents/skills/workflows/`](../.agents/skills/workflows/README.md) — longer process skills; invoke with `@` when needed. Meta index: [`using-agent-skills/SKILL.md`](../.agents/skills/workflows/using-agent-skills/SKILL.md).
- **Repo overview for agents:** [`CLAUDE.md`](../CLAUDE.md) at the repository root.
