# MTB Aggregator Web

React frontend for the MTB deal aggregator. Built with Next.js 15 (App Router), Tailwind v4, TanStack Query, and shadcn/ui.

## Tech Stack

- **Next.js 15** — App Router, SSR/ISR
- **React 18** — UI
- **Tailwind v4** — styling (CSS variables, semantic tokens)
- **shadcn/ui** — Button, Input, Select, Card, **Drawer** ([Vaul](https://github.com/emilkowalski/vaul)) primitives; add `Sheet` via `pnpm dlx shadcn@latest add sheet` if you need a Radix Dialog slide-over
- **TanStack Query** — admin dashboard data fetching
- **Storybook 8** — component development and docs

## Features

- **SSR/ISR** — Home, `/categories`, deals list, and deal detail pages are server-rendered for SEO
- **Categories hub counts** — The categories page shows **`product_count`** from `GET /categories/tree` (one per distinct `product_group_key`, matching the grouped deals list). Other UI still uses **`deal_count`** (listing rows) where noted in code, e.g. sitemap category paths and `categoryHasDeals` chips
- **Structured data (JSON-LD)** — `WebSite` + `SearchAction` and `ItemList` on the home page; `BreadcrumbList` + `ItemList` on `/deals` and `/deals/c/[...slug]`; `CollectionPage` (with `hasPart` for each top-level department) on `/categories`; `BreadcrumbList` + `Product` + `Offer` on deal detail. Implemented via [`src/components/JsonLd.tsx`](src/components/JsonLd.tsx) and [`src/lib/jsonLd.ts`](src/lib/jsonLd.ts)
- **Default social image** — Root layout sets Open Graph and Twitter images to [`public/the-dropper-logo-horizontal.png`](public/the-dropper-logo-horizontal.png); deal pages override with the listing image when available
- **llms.txt** — [`public/llms.txt`](public/llms.txt) and [`public/llms-full.txt`](public/llms-full.txt) describe the site for AI crawlers (GEO)
- **Sitemap & robots** — [`src/app/sitemap.ts`](src/app/sitemap.ts) (revalidated hourly): `/`, `/deals`, `/categories`, every `/deals/c/...` from `GET /categories/tree`, and deal detail URLs from `GET /deals` (paginated; caps at 48k deal URLs). [`src/app/robots.ts`](src/app/robots.ts) allows crawlers on public routes and disallows `/admin/`. Requires API at build/runtime for full URL lists; falls back to static routes if the API is unreachable
- **Canonical category URLs** — [`src/middleware.ts`](src/middleware.ts) 308-redirects `/deals?category=<slug>` to `/deals/c/...`, preserving other query params. Home category cards link directly to `/deals/c/...` via [`src/lib/dealsCategoryPath.ts`](src/lib/dealsCategoryPath.ts). After taxonomy migrations (e.g. `022`), regenerate [`packages/shared/categories.export.json`](../../packages/shared/categories.export.json) so middleware’s static tree matches production `GET /categories/tree` (unknown slugs still fall back to legacy path parsing).
- **GEO / category intros** — `/deals/c/[...slug]` passes optional `intro` from [`src/lib/categorySeo.ts`](src/lib/categorySeo.ts) into `DealsPageContent` above the filter chips. **Deal detail** resolves `canonical_category` to a category slug via [`src/lib/categoryTree.ts`](src/lib/categoryTree.ts) and, when it would not duplicate “Back to deals” (same pathname), shows a link to `/deals/c/...` with the path label (`Parent › Child — more deals in this category`). Hidden when `from=` already points at that category list
- **SEO / internal links** — Public navigations use `<Link>` from `next/link` (crawlable `<a>` tags, prefetch-on-hover). Deal cards and category cards link to internal routes; `router.push` is reserved for programmatic actions (e.g. home search form submit). From the deals list, deal URLs include `?from=<encoded list path>` so “Back to deals” restores the current filters; values are validated server-side to `/deals`, `/deals?...`, or `/deals/c/...` (category routes).
- **Navigation feedback** — Route-level `loading.tsx` skeletons for cross-route navigations; on `/deals` and `/deals/c/[...slug]`, same-route URL updates (filters, sort, pagination, toolbar search) wrap `router.replace` in `useTransition` and show a dimmed results area with a spinner until the RSC payload arrives
- **Deals filters** — Brand options on `/deals` come from `GET /facets` `brand_facets` (scoped to category and other filters), not the global `/brands` list
- **Deals categories** — Category selection is **above** the product grid (`DealsCategoryNav`): breadcrumbs (All + ancestors) and a chip row that shows **subcategories** when the current category has children (drill down), or **sibling** categories when it is a leaf (so users can switch peers without going up). At the site root with no category selected, chips list top-level categories. **`DealsBrowseFooter`** at the bottom lists crawlable `<Link>`s to each top-level department (cross-linking for SEO). Store, brand, discount, and spec/variant filters are only in the **sidebar** (desktop) or **filter drawer** (mobile). **SEO category URLs** use `/deals/c/<segments>` where each segment is derived from the **category tree** (child slug minus `parent.slug + "-"`), so a single logical segment can contain hyphens (e.g. `components-wheels-tires` → `/deals/c/components/wheels-tires`, not `/deals/c/components/wheels/tires`). [`src/lib/dealsCategoryPath.ts`](src/lib/dealsCategoryPath.ts) implements this; [`src/middleware.ts`](src/middleware.ts) uses a static tree from [`packages/shared/categories.export.json`](../../packages/shared/categories.export.json) for `?category=` redirects. The legacy `?category=<slug>` query on `/deals` still works; programmatic category changes prefer the `/deals/c/...` form. **`deal_count`** on each node from `GET /categories/tree` (subtree rollup of in-stock, visible listings) drives: hiding category chips / home cards / footer links when zero; omitting those paths from [`sitemap.ts`](src/app/sitemap.ts); and `noindex` on category pages with no inventory (metadata on `/deals/c/[...slug]`).
- **Dark mode** — Toggle in nav header; defaults to system preference (`prefers-color-scheme`), persists choice in `localStorage`
- **PostHog** — With `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` set, [`instrumentation-client.ts`](src/instrumentation-client.ts) initializes PostHog. Deals page category changes emit `filter_applied` with `filter_type: "category"` plus `nav_source` (`breadcrumb` | `chip` | `all_clear`) and `category_slug` when a slug is selected; `value` is the category slug or empty when cleared
- **Branding** — Primary logo is `public/logo.png` (admin UI). Favicons: `public/favicon.png` / `public/favicon-light.png` via `metadata.icons` in `src/app/layout.tsx` (paired with `prefers-color-scheme`). The public nav uses `logo-light.png` in dark mode (`NavHeader`). Other assets in `public/` are optional (e.g. alternate wordmarks).
- **Admin** — `/admin/llm-profiles`: LLM prompt profiles with a **Field library** tab (CRUD `llm_extraction_field_defs`) and a composition editor for profiles backed by migration `019` (`profile_fields`), including overrides and inline custom fields; legacy raw JSON editing remains for profiles without composition rows. Field types include `multi_enum` (migration `020`) for multiple values per key in `metadata.llm_specs`
- **Admin categories** — `/admin/categories`: optional per-category **description** (LLM classification rubrics; not the same as SEO copy in [`src/lib/categorySeo.ts`](src/lib/categorySeo.ts)). Returned on `GET /categories/tree` and used by the API when building the LLM category classifier prompt
- **Admin Data Browser** — `/admin/data`: `GET /admin/listings` supports `category_slug` (subtree on `category_id`, same as public `GET /deals`) via the structured **Category (public)** picker; the legacy **Canonical path (exact)** dropdown still matches `canonical_category` for drift triage

## Linting & security (ESLint)

- **`pnpm run lint`** — `next lint` using [`eslint.config.mjs`](eslint.config.mjs): extends `next/core-web-vitals`, `next/typescript`, and [`eslint-plugin-security`](https://github.com/eslint-community/eslint-plugin-security) (`security/recommended`). CI runs this on every PR.
- **`pnpm exec tsc --noEmit`** — TypeScript check without emit (also in CI).
- **`pnpm run seo:smoke`** — Fast assertions on JSON-LD builders ([`scripts/seo-smoke.ts`](scripts/seo-smoke.ts)); runs in CI (shift-left SEO checks without a live server).

## SEO monitoring (CI)

GitHub Actions runs **Lighthouse CI** against `http://127.0.0.1:3000/` and `/deals` after a production build **when** repository **Actions → Variables** defines `API_URL` (same value the web build uses so pages can render with data). Config: [`lighthouserc.json`](lighthouserc.json). Reports are written under `apps/web/.lighthouseci/` (gitignored). Tune thresholds in `ci.assert.assertions` if the SEO score gate is too strict for your templates.

**Optional MCP (local):** [`.cursor/mcp.json`](../../.cursor/mcp.json) can register `google-searchconsole-mcp` and `pagespeed-insights-mcp` for Search Console and PageSpeed Insights from the IDE.

- **Google Search Console MCP** — Stop anything on port 3000, then run `npx --yes --package=google-searchconsole-mcp gsc-mcp-auth` once (tokens in `~/.gsc-mcp/tokens/`).
- **PageSpeed Insights MCP** — The `pagespeed-insights-mcp` package requires **`GOOGLE_API_KEY`** at startup (`Environment validation failed` if unset). In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), enable **PageSpeed Insights API**, create an **API key**, then in **Cursor → Settings → MCP** edit the `pagespeed-insights` server and set env **`GOOGLE_API_KEY`**. **Do not put the key in [`.cursor/mcp.json`](../../.cursor/mcp.json)** (committed config); use Cursor’s MCP env UI or a local-only override so the key never lands in git. Restrict the key to that API in Google Cloud when possible. The repo sets **`NODE_ENV=production`** for this server so it does not load the `pino-pretty` transport (which is missing under `npx` and causes `unable to determine transport target for "pino-pretty"`). If you override env in Cursor, keep **`NODE_ENV=production`** (or install `pino-pretty` globally—prefer `NODE_ENV`).

**Bing:** Submit the same sitemap URL in [Bing Webmaster Tools](https://www.bing.com/webmasters) for Bing/Copilot coverage (manual one-time setup).

- The **`security/detect-object-injection`** rule is noisy for safe dynamic record access in React/TS; it is left at **warn** so builds still succeed—review warnings in admin/data-heavy components when changing those patterns.

## Development

```bash
pnpm run dev          # Next.js dev server (port 3000)
pnpm run storybook    # Storybook (port 6006)
pnpm run build        # Production build
```

The API must be running for data. Configure `NEXT_PUBLIC_API_URL` (client) or `API_URL` (server) or use the default proxy (`/api` → `http://localhost:8080`).

**Canonical site URL (SEO):** Set `NEXT_PUBLIC_SITE_URL` to your public origin (e.g. `https://thedropper.shop`) so `metadataBase`, Open Graph `url`, canonical links, [`sitemap.ts`](src/app/sitemap.ts), and [`robots.ts`](src/app/robots.ts) resolve correctly.

- **Vercel Production:** `NEXT_PUBLIC_SITE_URL` is **required** — the app throws if it is unset (see [`src/lib/siteUrl.ts`](src/lib/siteUrl.ts)). Do **not** rely on `VERCEL_URL` in production; it is the deployment hostname and would poison canonicals and sitemap URLs.
- **Vercel Preview:** When unset, the origin falls back to `https://${VERCEL_URL}` so preview deployments still work.
- **Local dev:** Defaults to `http://localhost:3000` (set `NEXT_PUBLIC_SITE_URL` if you use another port). GitHub Actions sets `NEXT_PUBLIC_SITE_URL` for CI builds — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

### Production checklist (apex canonical: `https://thedropper.shop`)

Do these in order after changing DNS/domains or fixing indexing issues:

1. **Vercel — Environment variables**  
   **Settings → Environment Variables:** `NEXT_PUBLIC_SITE_URL` = `https://thedropper.shop` for **Production** only (leave Preview unset so previews use `VERCEL_URL`). Redeploy production.

2. **Vercel — Domains**  
   **Settings → Domains:** `thedropper.shop` = **primary** (not “redirect to”). `www.thedropper.shop` = **Redirect** to `https://thedropper.shop` with status **308**.

3. **Porkbun — DNS** (or match whatever Vercel shows under Domains → your hostname → **DNS records**)

   - **Apex `@`:** **ALIAS** to `cname.vercel-dns.com` (preferred at Porkbun), or **A** to `76.76.21.21`.
   - **`www`:** **CNAME** to `cname.vercel-dns.com`.
   - Remove conflicting legacy **A**/**AAAA**/**CNAME** on `@` or `www` (parking, old host). Keep MX/TXT as needed.

4. **Google Search Console**  
   **Sitemaps:** remove `https://www.thedropper.shop/sitemap.xml` if present; add `https://thedropper.shop/sitemap.xml`. Use **Indexing → Pages → Validate fix** on affected buckets after the redeploy.

5. **Verify** (expect 200/308 and apex in HTML — not `*.vercel.app`):

   ```bash
   curl -sI https://www.thedropper.shop/ | head -n 5
   curl -sI https://thedropper.shop/deals | head -n 5
   curl -s https://thedropper.shop/ | grep -E 'rel="canonical"|property="og:url"'
   curl -s https://thedropper.shop/robots.txt
   ```

## Custom domain (Vercel + DNS at Porkbun or any registrar)

Use this when the site should load at your own domain (e.g. `https://example.com`) instead of only `*.vercel.app`.

1. **Vercel — add the domain**  
   In the project: **Settings → Domains → Add**. Enter the apex (`example.com`) and, if you want it, `www.example.com`. Vercel will show the exact **DNS records** to create (types, names, and values). Prefer those over generic instructions; Vercel may update recommended records over time.

2. **Registrar (e.g. Porkbun) — create matching DNS records**  
   In Porkbun: **Domain Management → your domain → DNS** (or **Authoritative DNS**). Add the records Vercel lists—commonly an **A** (or **ALIAS** if offered) for the apex and a **CNAME** for `www` pointing at Vercel’s host. Remove or replace any old **A** / **AAAA** / **CNAME** on `@` or `www` that would conflict (e.g. parking page, old host).

3. **Wait for DNS + TLS**  
   Propagation can take minutes to a few hours. Vercel issues HTTPS automatically once DNS verifies. The dashboard shows **Valid Configuration** when ready.

4. **Redirects**  
   In **Settings → Domains**, set one hostname as the primary (e.g. apex) and add a redirect from `www` → apex (or the reverse) so users only see one canonical URL.

5. **API URL**  
   `NEXT_PUBLIC_API_URL` should remain your **API origin** (e.g. Render `https://your-api.onrender.com`), not your new web domain, unless you put the API behind the same hostname via a reverse proxy.

6. **CORS (if the API restricts origins)**  
   If the Go API sets `CORS_ORIGINS` to a comma-separated allowlist (not `*`), add every origin where the browser loads the app, e.g. `https://example.com,https://www.example.com`. See [apps/api/README.md](../api/README.md).

## Sentry (error monitoring)

When `NEXT_PUBLIC_SENTRY_DSN` is set, the app loads Sentry on the client, server, and edge ([`@sentry/nextjs`](https://docs.sentry.io/platforms/javascript/guides/nextjs/)). Files: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/app/global-error.tsx`.

| Variable                                            | Purpose                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`                            | Required to enable Sentry (same DSN in Sentry’s Next.js wizard)                                                  |
| `SENTRY_ENVIRONMENT`                                | e.g. `production`; client also gets `NEXT_PUBLIC_SENTRY_ENVIRONMENT` or mapped `VERCEL_ENV` via `next.config.ts` |
| `SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA`          | Release grouping; client uses `NEXT_PUBLIC_SENTRY_RELEASE` populated at build from those                         |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional; enable source map upload on `next build` (e.g. Vercel env or CI)                                       |

Without `SENTRY_AUTH_TOKEN`, builds skip source map upload (`sourcemaps.disable` in `next.config.ts`); errors still report, stacks are less readable.

**Convention:** With `NEXT_PUBLIC_SENTRY_DSN` set, do not rely on `console.error` alone for user-impacting failures—ensure they reach Sentry (Next defaults + `global-error.tsx`; in `try/catch` that handles fatally without rethrowing, call `Sentry.captureException`). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Component Library

### Primitives (`src/components/ui/`)

Use shadcn primitives for new UI:

- **Button** — `variant`, `size`, `asChild`. Text sizes use **`min-h-*` + padding** (not fixed `h-*`) so labels don’t clip; **`xs`–`lg`** follow the same idea with smaller steps. **Icon** sizes use `min-h-*` / `min-w-*` + `aspect-square` instead of `size-*`.
- **Input** — text, search, number, password
- **Select** — native `<select>` styled to match Input (border, focus ring, `min-h-9` so text doesn’t clip on small screens)
- **Card** — CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **Drawer** — bottom/side drawer with **slide + drag** ([Vaul](https://ui.shadcn.com/docs/components/radix/drawer)); used for the **mobile filter** UI on `/deals`

Add more: `pnpm dlx shadcn@latest add <component>`

### Composed Components (`src/components/`)

DealCard, CategoryCard, DealsCategoryNav, DealsBrowseFooter, Pagination, SearchBar, FilterInput, etc. — built from primitives. CategoryCard supports optional `imageSrc` for home page category imagery (`stock-bikes.jpg`, `stock-components.jpg`, etc. in `public/`).

### Storybook

- Run `pnpm run storybook` to develop components in isolation
- Add `*.stories.tsx` for new components (CSF3 format)
- Theme toolbar for light/dark palette iteration

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#component-library) for details. Visual identity and copy: [docs/DESIGN.md](../../docs/DESIGN.md).
