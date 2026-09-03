# MTB Aggregator Web

React frontend for the MTB deal aggregator. Built with Next.js 15 (App Router), Tailwind v4, TanStack Query, and shadcn/ui.

## Tech Stack

- **Next.js 15** — App Router, SSR/ISR
- **React 19** — UI (`useOptimistic` for deal filters)
- **Tailwind v4** — styling (CSS variables, semantic tokens)
- **shadcn/ui** — Button, Input, Select, Card, **Drawer** ([Vaul](https://github.com/emilkowalski/vaul)) primitives; add `Sheet` via `pnpm dlx shadcn@latest add sheet` if you need a Radix Dialog slide-over
- **TanStack Query** — admin dashboard data fetching
- **Storybook 8** — component development and docs

## Features

- **Home page deals** — **Recent price drops** row (`GET /deals?sort=price_drop`, 6 deals; hidden when empty) plus four category-scoped rows (MTB, eMTB, components, gear) in horizontal [`DealCarousel`](src/components/DealCarousel.tsx) scrollers; config in [`src/lib/homeDealSections.ts`](src/lib/homeDealSections.ts). Category rows fetch `GET /deals?sort=value&category_slug=…` (`$40` min for bikes, `$25` for components/gear). Empty rows are hidden. PostHog `home_section` includes `price_drops` for the price-drop carousel. **Open entries** — when `GET /giveaways` has at least one **open** row, Home shows up to three compact [`GiveawayCard`](src/components/GiveawayCard.tsx)s ([`HomeGiveawaysStrip`](src/components/HomeGiveawaysStrip.tsx)); hidden when none are open.
- **Giveaways & raffles** — [`/giveaways`](src/app/(public)/giveaways/page.tsx): curated directory (not hosted contests). Header **Giveaways**, H1 **Giveaways & raffles**. Cards distinguish giveaway vs raffle CTAs (“Enter on {host}” / “Get tickets on {host}”). Status is re-derived from timestamps in the UI so stale ISR cannot keep an Enter button after close. Empty state links to `/deals`. At runtime a failed `GET /giveaways` uses [`error.tsx`](src/app/(public)/giveaways/error.tsx) instead of that empty state (Home still hides the strip on fetch failure). During `next build` prerender only, a failed fetch falls back to empty so Vercel is not blocked if the API is down.
- **SSR/ISR** — Home, `/categories`, deals list, and deal detail pages are server-rendered for SEO. Public listing routes use **4h ISR** ([`src/lib/revalidate.ts`](src/lib/revalidate.ts)), aligned with the API scrape cadence (~4h). **`/giveaways` is the exception: `revalidate = 60`** plus fetch cache tag `giveaways`. Admin save calls `POST /admin/api/revalidate` for `/giveaways` and `/` (non-fatal if purge fails). **Admin → Cache** (`/admin/cache`) can on-demand purge a specific path (e.g. `/deals?sort=price_drop`) or the `public-data` fetch cache tag after deploys (requires `ADMIN_PASSWORD` on the web app).
- **Custom 404** — [`NotFoundContent`](src/components/NotFoundContent.tsx) replaces the default Next.js 404 (Workshop Modern styling, `noindex`). Public `notFound()` calls use [`(public)/not-found.tsx`](src/app/(public)/not-found.tsx) inside the site chrome; unmatched URLs use root [`not-found.tsx`](src/app/not-found.tsx).
- **Category deal counts** — Homepage tiles, Categories mega-menu, `/categories` hub, and `/deals` browse chips all show **`product_count`** from `GET /categories/tree` (one per distinct `product_group_key`, matching `GET /deals?group_variants=true`). `deal_count` remains the listing-row rollup for older API fallbacks. Sitemap inclusion and empty-category `noindex` use the same shopper-facing count via `categoryHasDeals`. Paginated listing totals use a shared `offset=0&limit=1` deals fetch so page 1 and page N of the same filter set do not drift under ISR.
- **Structured data (JSON-LD)** — `WebSite` + `SearchAction` and `ItemList` on the home page; `BreadcrumbList` + `ItemList` (with embedded `Product` on category/hub/brand pages) + optional `AggregateOffer` on `/deals/c/[...slug]`, **`/deals/hub/[slug]`**, and **`/deals/brand/[slug]`**; `CollectionPage` on `/categories`; **`CollectionPage` + `ItemList` on `/giveaways`** (names and `#slug` URLs only — no `Event` / `Offer`); `BreadcrumbList` + `Product` + `Offer` (with price-history bounds when available) on deal detail and **`/deals/[id]/price-history`**. See [`src/lib/jsonLd.ts`](src/lib/jsonLd.ts)
- **Branding** — Public nav renders the trail-drop logo via [`TheDropperLogo`](src/components/TheDropperLogo.tsx) (inline SVG, `currentColor`; Storybook: `Components/TheDropperLogo`). Standalone artwork: [`public/the-dropper-logo.svg`](public/the-dropper-logo.svg); square icon variant [`public/the-dropper-icon.svg`](public/the-dropper-icon.svg) is the source for `favicon.png` / `favicon-light.png`. See [docs/DESIGN.md](../../docs/DESIGN.md).
- **Default social image** — Root layout sets Open Graph and Twitter images to [`public/the-dropper-logo-horizontal.png`](public/the-dropper-logo-horizontal.png); deal pages override with the listing image when available
- **llms.txt** — [`public/llms.txt`](public/llms.txt) and [`public/llms-full.txt`](public/llms-full.txt) describe the site for AI crawlers (GEO)
- **Sitemap & robots** — [`src/app/sitemap.ts`](src/app/sitemap.ts): static routes (including **`/giveaways`**, daily, priority 0.7), `/deals/c/...`, indexable **`/deals/hub/...`** and **`/deals/brand/...`** (≥3 deals), and deal URLs (48k cap; `lastModified` from `last_scraped`). [`src/app/robots.ts`](src/app/robots.ts) disallows `/admin/`; admin layout also sets `noindex`. **Deal detail** pages (`/deals/{id}`) are `index, follow` with a query-free canonical ([`src/lib/dealPageMetadata.ts`](src/lib/dealPageMetadata.ts)); **`/deals/{id}/price-history`** is `noindex`. **Google Shopping feed:** [`/feed/google-shopping.xml`](src/app/feed/google-shopping.xml/route.ts)
- **Canonical category URLs** — [`src/middleware.ts`](src/middleware.ts) 308-redirects `/deals?category=<slug>` to `/deals/c/...`, preserving other query params; migration **`037`** also 308-redirects legacy Clothing paths (`/deals/c/gear/clothing/tops/...`) via [`src/lib/clothingCategoryRedirects.ts`](src/lib/clothingCategoryRedirects.ts). Home category cards link directly to `/deals/c/...` via [`src/lib/dealsCategoryPath.ts`](src/lib/dealsCategoryPath.ts). After taxonomy migrations (e.g. `022`, `037`), regenerate [`packages/shared/categories.export.json`](../../packages/shared/categories.export.json) so middleware’s static tree matches production `GET /categories/tree` (unknown slugs still fall back to legacy path parsing).
- **GEO / category intros** — Category intros from [`src/lib/categorySeo.ts`](src/lib/categorySeo.ts). **SEO hubs** ([`src/lib/seoHubs.ts`](src/lib/seoHubs.ts)) and **brand pages** ([`src/lib/brandSeo.ts`](src/lib/brandSeo.ts)) at `/deals/hub/[slug]`, `/deals/brand/[slug]`, and `/deals/brand/[slug]/c/...`. Hub filters support `category_slug`, optional `brands` / price bands, and optional default full-text **`q`** (applied server-side when the hub URL has no `?q=`). Hubs may include optional FAQ + `FAQPage` JSON-LD, parent category links, and sibling hub links ([`SeoHubFaq`](src/components/SeoHubFaq.tsx), [`SeoHubRelatedLinks`](src/components/SeoHubRelatedLinks.tsx)); **Popular searches** and category intros render below the deal grid on `/deals/c/...` so listings stay above the fold; the **home page** also links inventory-eligible hubs. Hub/brand shortcut links at page bottom when inventory allows. Price-band examples: [`/deals/hub/mountain-bikes-under-3000`](src/lib/seoHubs.ts) and [`/deals/hub/emtbs-under-5000`](src/lib/seoHubs.ts) (eMTBs under $5,000). After deploy, use GSC URL Inspection → **Request indexing** on priority hubs (see [`docs/ideas/price-band-hub-indexing.md`](../../docs/ideas/price-band-hub-indexing.md)). **Deal detail** back nav uses **sessionStorage** ([`src/lib/dealDetailBackStorage.ts`](src/lib/dealDetailBackStorage.ts)); middleware 308-strips legacy `?from=` so tracking URLs cannot be indexed as a separate document. **`/deals/[id]/price-history`** is a `noindex` price-tracker page. **Deal score** via [`src/lib/dealScore.ts`](src/lib/dealScore.ts)
- **SEO / internal links** — Public navigations use `<Link>` from `next/link` (crawlable `<a>` tags, prefetch-on-hover). Deal cards link to canonical `/deals/[id]`; list context for “Back to deals” is stored in **sessionStorage** on click (middleware 308-strips legacy `?from=` query params). Related deals on detail pages link same-brand/category listings ([`src/components/RelatedDeals.tsx`](src/components/RelatedDeals.tsx)).
- **Navigation feedback** — Route-level `loading.tsx` skeletons for cross-route navigations mirror **Workshop Modern** shells (`border-foreground`, square deal media, SKU tab, open-frame search placeholder); shared pieces live in [`src/components/skeletons/`](src/components/skeletons/). On `/deals` and `/deals/c/[...slug]`, same-route URL updates (filters, sort, pagination, toolbar search) wrap work in `useTransition` and show a dimmed results area with a spinner until the RSC payload arrives; **`useFilterParams`** uses **`useOptimistic`** with a memoized URL **canonical** state — the optimistic setter runs in the **same** `startTransition` as `router.replace` (per [React](https://react.dev/reference/react/useOptimistic)), then reconciles when the URL updates
- **Deals filters** — Brand and spec filters use **multi-select checkbox groups** in the sidebar/drawer. URL state uses repeated query params (e.g. `?brand=SRAM&brand=Shimano&spec_tire_width=2.3&spec_tire_width=2.4`): OR within the same facet key, AND across keys. **Price range** (`min_price`, `max_price`) is available on all deals pages via sidebar/drawer; facets return `price_range` hints. Brand options on `/deals` come from `GET /facets` `brand_facets` (scoped to category and other filters), not the global `/brands` list; when any brand is selected, the app also requests facets **without** `brand` so the full brand list stays available (same pattern as before). Default sort on `/deals` is **`value`** (best savings amount); **`Highest discount`** remains selectable. **Clear all** resets query-backed filters (search, store, brands, specs, discount, price, pagination, legacy `category` query) while **keeping** the `/deals/c/...` path when you are browsing a category (category is browsing context; use breadcrumbs/nav to leave the category). **SEO hubs** (`/deals/hub/...`) and **brand+category** pages lock a `category_slug` in the route (those paths are not `/deals/c/...`, so URL parsing cannot recover the category); the deals UI uses that slug so spec facets (frame material, wheel size, travel, etc.) and category breadcrumbs match category pages. Spec facets render whenever `GET /facets` returns `spec_facets`
- **Deals categories** — Primary category browsing is the **`DealsMegaMenu`** under **Deals** in [`NavHeader`](src/components/NavHeader.tsx): desktop nav has **DEALS** (link to `/deals`) plus a **CATEGORIES** item that opens a full-width mega menu (hover or click); mobile uses a full-width **DEALS** row plus a **CATEGORIES** row in the nav drawer. On **base `/deals`**, **`DealsCategoryNav`** renders **browse-by-category chips** (top-level departments with deal counts) above the grid, plus an outline **See all** chip to `/categories`; on category, **SEO hub**, and **brand+category** pages it shows a text breadcrumb trail (`All deals › …`) with no section label, using the route-locked category. Category links **reset pagination** (`offset` dropped) while preserving other query filters; same-route filter/sort changes also reset page via **`useFilterParams`**. Store, brand, discount, price, and spec filters are only in the **sidebar** (desktop) or **filter drawer** (mobile). **SEO category URLs** use `/deals/c/<segments>` where each segment is derived from the **category tree** (child slug minus `parent.slug + "-"`), so a single logical segment can contain hyphens (e.g. `components-wheels-tires` → `/deals/c/components/wheels-tires`, not `/deals/c/components/wheels/tires`). [`src/lib/dealsCategoryPath.ts`](src/lib/dealsCategoryPath.ts) implements this; [`src/middleware.ts`](src/middleware.ts) uses a static tree from [`packages/shared/categories.export.json`](../../packages/shared/categories.export.json) for `?category=` redirects. The legacy `?category=<slug>` query on `/deals` still works; programmatic category changes prefer the `/deals/c/...` form. **`product_count`** on each node from `GET /categories/tree` (grouped deals in the subtree, matching the listing grid) drives: displayed counts on the mega menu / home cards / browse chips / categories hub; dimming empty categories when zero; omitting those paths from [`sitemap.ts`](src/app/sitemap.ts); and `noindex` on category pages with no inventory (metadata on `/deals/c/[...slug]`). `deal_count` is the ungrouped listing-row rollup and is only a fallback when `product_count` is missing.
- **Dark mode** — **`html` never receives the `dark` class** (blocking script in `layout.tsx` + `ThemeProvider`). Workshop Modern is **light-only** on the canvas; legacy `.dark` variables in `globals.css` keep lime primary/focus if `.dark` ever appears (e.g. browser tools). `ThemeContext` remains for API stability. `localStorage.theme` is ignored for the document class until a future dark Workshop theme ships.
- **PostHog** — With `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` set, [`instrumentation-client.ts`](src/instrumentation-client.ts) initializes PostHog. Deals page category changes emit `filter_applied` with `filter_type: "category"` plus `nav_source` (`breadcrumb` | `chip` | `browse_chips` | `all_clear` | `mega_menu`) and `category_slug` when a slug is selected; `value` is the category slug or empty when cleared. Toggling **brand**, **spec**, or **price** filters emits `filter_applied` with `filter_type` (`brand` | `spec` | `min_price` | `max_price`), `value`, `action` (`add` | `remove` where applicable), and `selected_count` (number of selected values for that facet after the toggle; brand uses total selected brands). Clearing filters emits `filters_cleared` with `had_category_path` (`true` when the URL path was under `/deals/c/...` before the clear) and **`had_hub_path`** (`true` when under `/deals/hub/...`). When filter/sort/pagination navigation stays pending longer than ~15s, **`deals_transition_timeout`** fires with `duration_ms`, `pathname`, `search_params`, `sort`, and `offset`. **Retailer outbound clicks** from deal cards and deal detail emit **`deal_outbound_click`** (`cta`, `deal_id`, `store`, `brand`, **`list_surface`**: `hub` | `category` | `deals_list` | `home` | `other`). **`deal_card_click`** and **`deal_detail_viewed`** include **`list_surface`** where applicable, plus **`in_stock_size_count`** / **`in_stock_color_count`** (and `in_stock_variant_count` on detail); home carousels also send optional **`home_section`** (`mtb` | `emtb` | `components` | `gear`). **Giveaways:** `giveaway_page_viewed` on `/giveaways` mount; `giveaway_outbound_click` on Enter/Get-tickets (`giveaway_id`, `kind`, `status`, `host_name`, `surface`: `home` | `giveaways`); kind chips reuse `filter_applied` with `filter_type: "giveaway_kind"` and `value` `all` | `giveaway` | `raffle`. Do not send `entry_url` or titles.
- **Legal / affiliates** — [`src/components/AffiliateDisclosure.tsx`](src/components/AffiliateDisclosure.tsx) in the public footer: compensated links may earn commission; links to [`/giveaways`](src/app/(public)/giveaways/page.tsx), [`/policies`](src/app/(public)/policies/page.tsx) and [`/returns`](src/app/(public)/returns/page.tsx) for Merchant Center–aligned shipping/returns disclosure (aggregator does not fulfill orders). Giveaway CTAs are host-site hops (`rel="nofollow"`), not affiliate deal links.
- **Admin** — `/admin/llm-profiles`: LLM prompt profiles with a **Field library** tab (CRUD `llm_extraction_field_defs`) and a composition editor for profiles backed by migration `019` (`profile_fields`), including overrides and inline custom fields; legacy raw JSON editing remains for profiles without composition rows. When the API sets `category_id`, profile detail shows **effective extraction schema** (merged with ancestor categories—the runtime schema for enrichment/facets). Field types include `multi_enum` (migration `020`) for multiple values per key in `metadata.llm_specs`
- **Admin giveaways** — `/admin/giveaways`: create/edit/unpublish/delete curated contests. Ticket price fields show only for `kind=raffle`. Saves invalidate admin queries and revalidate `/giveaways` + `/` (plus the `giveaways` fetch tag).
- **Admin categories** — `/admin/categories`: optional per-category **description** (LLM classification rubrics; not the same as SEO copy in [`src/lib/categorySeo.ts`](src/lib/categorySeo.ts)). Returned on `GET /categories/tree` and used by the API when building the LLM category classifier prompt
- **Admin Data Browser** — `/admin/data`: `GET /admin/listings` supports `category_slug` (subtree on `category_id`, same as public `GET /deals`) via the structured **Category (public)** picker; the legacy **Canonical path (exact)** dropdown still matches `canonical_category` for drift triage. Sort includes **Recently enriched** (`sort=last_enriched`) to review listings by `last_enriched_at`; the table shows last enriched timestamps. Listing detail modal: **CategoryPicker** saves via `PATCH /admin/listings/:id/category` (syncs variant siblings; may suggest a taxonomy rule to create); bulk toolbar **Set category** uses `POST /admin/listings/bulk-set-category`; **Demote from home** / **Restore on home** use `POST /admin/listings/bulk-set-home-demoted` with the same filters (e.g. demote all variants at once); **Hide all** uses `POST /admin/listings/bulk-set-hidden` with the same filters; spec overrides use profile-driven widgets (`enum` → select, `multi_enum` → checkboxes) from `GET /admin/categories/:id/profile-fields`. Row actions include **Run LLM specs** (PDP-independent classify + extraction); toolbar supports **bulk LLM specs** with the same filters as bulk classify/enrich
- **Admin Normalization** — `/admin/normalization`: spec key aliases, value rules, **Re-normalize specs**, and **Re-normalize brands** (`POST /admin/renormalize-brands`) to merge vendor brand variants onto canonical names from `brand_aliases.json`
- **Admin Operations** — `/admin/operations`: alongside **Re-enrich** and **Re-classify**, **LLM specs only** calls `POST /llm-specs-now` with the selected store / canonical-path / confidence filters plus optional inclusion of listings with empty scraped specs. **Database maintenance** lists incremental migration status (`GET /admin/db/migrations`) and can run pending migrations (`POST /admin/db/migrate`) or the idempotent store seed (`POST /admin/db/seed`); in production the API must set `ALLOW_ADMIN_DB_OPS=1` for run actions
- **Admin Insights** — `/admin/insights`: flow-centric pipeline health from `GET /admin/metrics/pipeline` and `GET /admin/metrics/enrichment-steps` — scrape→extract p50/p95, per-step due/in-flight/dead/oldest-due gauges, daily enrichment event throughput (PDP/classify/extract), PDP freshness by `pdp_fetched_at`, scrape volume, and per-store PDP drainer status (cooldown, last fetch). 14/30/90-day window selector.
- **Admin Cache** — `/admin/cache`: on-demand ISR / fetch cache purge for public pages. Enter a path or full URL (e.g. `/deals?sort=price_drop`); Next.js revalidates by **pathname** so all sort/filter variants of `/deals` are cleared together. Quick presets, tag purge, and optional full-site purge. Uses `POST /admin/api/revalidate` on the Next.js app (Bearer `ADMIN_PASSWORD`; set the same env var on Vercel as on the API)

## Linting & security (ESLint)

- **`pnpm run lint`** — `eslint .` using [`eslint.config.mjs`](eslint.config.mjs): extends `eslint-config-next` (`core-web-vitals` + `typescript`) and [`eslint-plugin-security`](https://github.com/eslint-community/eslint-plugin-security) (`security/recommended`). CI runs this on every PR.
- **`pnpm run test`** — [`vitest`](https://vitest.dev/) unit tests (e.g. [`src/lib/filterParams.test.ts`](src/lib/filterParams.test.ts)); `pnpm run test:watch` for watch mode.
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
pnpm run test         # Vitest (filter URL parsing, etc.)
pnpm run storybook    # Storybook (port 6006)
pnpm run build        # Production build (runs prebuild → compiles @mtb-aggregator/logging)
```

`pnpm run build` runs **`prebuild`** first to compile the workspace `@mtb-aggregator/logging` package (required on Vercel/CI where `dist/` is not committed). Same pattern as `apps/scraper`.

The API must be running for data. Configure `NEXT_PUBLIC_API_URL` (client) or `API_URL` (server) or use the default proxy (`/api` → `http://localhost:8080`).

**Canonical site URL (SEO):** Set `NEXT_PUBLIC_SITE_URL` to your public origin (e.g. `https://thedropper.shop`) so `metadataBase`, Open Graph `url`, canonical links, [`sitemap.ts`](src/app/sitemap.ts), and [`robots.ts`](src/app/robots.ts) resolve correctly.

- **Vercel Production:** `NEXT_PUBLIC_SITE_URL` is **required** — the app throws if it is unset (see [`src/lib/siteUrl.ts`](src/lib/siteUrl.ts)). Do **not** rely on `VERCEL_URL` in production; it is the deployment hostname and would poison canonicals and sitemap URLs.
- **Vercel Preview:** When unset, the origin falls back to `https://${VERCEL_URL}` so preview deployments still work.
- **Local dev:** Defaults to `http://localhost:3000` (set `NEXT_PUBLIC_SITE_URL` if you use another port). GitHub Actions sets `NEXT_PUBLIC_SITE_URL` for CI builds — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

**Avantlink homepage verification (optional):** Set `NEXT_PUBLIC_AVANTLINK_VERIFY_SCRIPT_SRC` in Vercel (Production only, or Preview if you verify there) to the exact script URL Avantlink gives you (`http://` or `https://...affiliate_app_confirm.php?mode=js&authResponse=...`). Do **not** paste that URL into tracked source—it trips secret scanners. The homepage injects that tag via static HTML (not `next/script`), with a **literal** `&` between query parameters in the source—React’s normal `src={url}` escapes `&` as `&amp;`, which some verifiers mistakenly reject. Remove the variable after Avantlink confirms.

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

When `NEXT_PUBLIC_SENTRY_DSN` is set, the app loads Sentry on the client, server, and edge ([`@sentry/nextjs`](https://docs.sentry.io/platforms/javascript/guides/nextjs/)). Files: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/app/global-error.tsx`, **`src/app/(public)/deals/error.tsx`** (deals browse server fetch failures during client navigation, with URL filter context), and **`src/app/(public)/giveaways/error.tsx`** (`GET /giveaways` failures; tag `surface: giveaways_page`). Stuck deals transitions without a thrown error are reported as Sentry warnings from **`usePendingTimeout`** in `DealsPageContent`.

| Variable                                            | Purpose                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`                            | Required to enable Sentry (same DSN in Sentry’s Next.js wizard)                                                  |
| `SENTRY_ENVIRONMENT`                                | e.g. `production`; client also gets `NEXT_PUBLIC_SENTRY_ENVIRONMENT` or mapped `VERCEL_ENV` via `next.config.ts` |
| `SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA`          | Release grouping; client uses `NEXT_PUBLIC_SENTRY_RELEASE` populated at build from those                         |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional; enable source map upload on `next build` (e.g. Vercel env or CI)                                       |

Without `SENTRY_AUTH_TOKEN`, builds skip source map upload (`sourcemaps.disable` in `next.config.ts`); errors still report, stacks are less readable.

**Convention:** With `NEXT_PUBLIC_SENTRY_DSN` set, do not rely on `console.error` alone for user-impacting failures—ensure they reach Sentry (Next defaults + `global-error.tsx`; in `try/catch` that handles fatally without rethrowing, call `Sentry.captureException`). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Logging

Server-side startup logs use `@mtb-aggregator/logging` in `src/instrumentation.ts`. HTTP access logging is handled by Vercel; tune app logs with `LOG_LEVEL`, `LOG_FORMAT`. See [docs/LOGGING.md](../../docs/LOGGING.md).

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

DealCard, GiveawayCard, DealCarousel, VariantChips, CategoryCard, DealsMegaMenu, DealsCategoryNav, Pagination, SearchBar, FilterSelect (with `minDiscountFilterOptions` for stepped min discount), PriceRangeFilter (open-frame min/max, `min_price` / `max_price`), etc. — built from primitives. **DealCard** shows the retailer on the top tab (not SKU), uses a shorter **16:9** image on mobile (square from `sm` up), and pairs **Snag this deal** (retailer, `size="lg"`, full-width) with **View details** (internal PDP) in a vertically stacked footer when `href` is set; the details link carries the value prop in **`title`** (hover) and **`aria-label`** (assistive tech), not extra body copy. Grouped cards and the deal PDP show **in-stock size/color chips** ([`VariantChips`](src/components/VariantChips.tsx)); sold-out options are hidden. Cards stay to a single chip row (overflow `+N`); the PDP can wrap and show per-size prices when they differ. PostHog (when enabled): `deal_card_click` with `cta: "view_details"` (plus Vercel `deal_card_click`) and `in_stock_size_count` / `in_stock_color_count`. **GiveawayCard** uses Enter vs Get-tickets CTAs (no “Snag the Deal”). CategoryCard supports optional `imageSrc` for home page category imagery (`stock-bikes.jpg`, `stock-components.jpg`, etc. in `public/`).

**Forms — labels:** Every interactive filter/control should have a programmatic name. `FilterSelect` pairs `label htmlFor` with `Select id` (`useId()`, optional `controlId`). Brand/spec facets use [`CheckboxGroup`](src/components/ui/checkbox-group.tsx) (shadcn `Checkbox` + `Label`, `fieldset`/`legend`, ids from `sanitizeForHtmlId`). `CategoryDrillDown` wraps the tree in `fieldset`/`legend` instead of a loose `<label>`. Admin toolbars that look label-free use `sr-only` labels (see Data browser filters).

### Storybook

- Run `pnpm run storybook` to develop components in isolation
- Add `*.stories.tsx` for new components (CSF3 format)
- Theme toolbar for light/dark palette iteration
- **Design / Workshop Modern Preview** ([`src/components/WorkshopModernPreview.stories.tsx`](src/components/WorkshopModernPreview.stories.tsx)) is the live preview for the Direction C redesign proposal in [`docs/DESIGN_REDESIGN.md`](../../docs/DESIGN_REDESIGN.md). It overrides theme tokens **inside the story root only** so the new "Concrete & Lime" palette + Geist Sans × Geist Mono pairing are visible without affecting the rest of the app. Once primitives are approved there, they migrate into `src/components/ui/` and `globals.css` gets the matching token swap.

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#component-library) for details. Visual identity and copy: [docs/DESIGN.md](../../docs/DESIGN.md). Active redesign proposal: [docs/DESIGN_REDESIGN.md](../../docs/DESIGN_REDESIGN.md).
