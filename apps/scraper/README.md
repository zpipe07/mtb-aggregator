# MTB Aggregator Scraper

Node.js Express server using Playwright to scrape retailer sale pages. Returns structured listings and supports PDP enrichment for specs and category paths.

## Overview

- **Port:** 3000 (default)
- **Runtime:** Node.js 20+, TypeScript
- **Scraping:** Playwright (Chromium); needed for JS-rendered pages (e.g. JensonUSA)
- **Testing:** Set `SCRAPER_MAX_PRODUCTS=10` to limit products per scrape (0 = no limit)

## Environment

| Variable                               | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCRAPER_SERVICE_SECRET`               | Optional locally; **set in production** (same value as the API). When set, `POST /scrape`, `POST /enrich`, and `POST /scrape-debug` require `X-Scraper-Secret` or `Authorization: Bearer <secret>`. `GET /health` stays open for load balancers.                                                                                                                     |
| `SENTRY_DSN`                           | Optional; enables [Sentry](https://docs.sentry.io/platforms/javascript/guides/express/) (`src/bootstrap.ts`, `expressIntegration`, `setupExpressErrorHandler`). Same name as the API; use a dedicated Sentry **Node** project for the scraper.                                                                                                                       |
| `SENTRY_ENVIRONMENT`                   | e.g. `production`                                                                                                                                                                                                                                                                                                                                                    |
| `SENTRY_RELEASE` / `RENDER_GIT_COMMIT` | Release grouping on Render                                                                                                                                                                                                                                                                                                                                           |
| `BROWSER_USER_AGENT`                   | Chrome-like UA for Playwright (Backcountry). Default is desktop Chrome; **do not** use `MTBDealBot` here — it triggers AWS WAF.                                                                                                                                                                                                                                      |
| `SCRAPER_STORAGE_STATE`                | Path to Playwright **storage state** JSON (cookies/localStorage) after you pass WAF in a real browser. Helps **Backcountry** PLP scrape and **Competitive Cyclist PDP enrich** in some environments. CC listing ingest runs via the Impact catalog API on the Go API (see [apps/api/README.md](../api/README.md)); the scraper is not used for CC production ingest. |
| `SCRAPER_WAF_WAIT_MS`                  | Max wait for WAF challenge to clear (default `120000`).                                                                                                                                                                                                                                                                                                              |
| `SCRAPER_HEADED`                       | Set `1` to run a visible Chromium window (sometimes passes WAF when headless fails).                                                                                                                                                                                                                                                                                 |

### Backcountry (AWS WAF)

Backcountry can serve a **“Human Verification”** page to automated browsers. If scrape logs show tiny HTML / `gokuProps` and no products, the PLP never loaded.

**Fix:** save Playwright storage state after passing WAF in a real session, point `SCRAPER_STORAGE_STATE` at that JSON (path can be relative to repo root or `apps/scraper/`). Alternatively try `SCRAPER_HEADED=1` or a remote browser with US egress.

### Competitive Cyclist

Production ingest for **Competitive Cyclist** is **not** a scraper scrape route: the API scheduler calls the **Impact Partner Product Catalog** (`internal/impact`) when `IMPACT_ACCOUNT_SID` and `IMPACT_AUTH_TOKEN` are set. Use `make impact-catalog-probe` from the repo root to list catalogs and inspect a sample **Items** response. Outbound **`affiliate_url`** uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set on the API; otherwise the Impact catalog **`Url`** when applicable.

<<<<<<< HEAD
**PDP enrichment** for CC is supported via `POST /enrich` only (`competitivecyclist` enricher in `parsers/competitivecyclist.ts`, Backcountry-family Cheerio helpers). Uses **Playwright** (same AWS WAF handling as Backcountry PLP — not plain `fetch`). During enrich, JSON-LD **`hasVariant`** on the PDP is parsed and the API fans out **`product_group_key`** + **`variant_options`** to existing Impact catalog rows that share the same canonical **`product_url`** and matching **`store_sku`** (see `make backfill-cc-variants`). The API includes CC in `StoreTypesWithEnrichers` for nightly enrichment and admin **Enrich** actions.

If enrich logs show `waf_suspect=true` / `variants_parsed=0`, pass WAF once in a real browser and set **`SCRAPER_STORAGE_STATE`** to a Playwright storage JSON (e.g. `apps/scraper/cc-storage.json` — gitignored). After a successful PDP load, the scraper **overwrites that file** with fresh cookies so later headless enriches reuse the session. Also try **`SCRAPER_HEADED=1`** for the first solve, or a remote browser with US egress.

**Bootstrap storage (one-time):** from `apps/scraper`, run `pnpm exec playwright codegen --save-storage=cc-storage.json "https://www.competitivecyclist.com/..."`, complete WAF in the opened browser, then close codegen. Or set `SCRAPER_HEADED=1`, enrich one PDP manually, and let auto-save refresh `cc-storage.json`.

# **Debug logs:** scraper lines `[scraper] competitivecyclist enrich debug:` (`transport=playwright`, `html_bytes`, `waf_suspect`, `variants_parsed`, sample SKUs); API lines `[cc-variants]` (variant count from enrich, fan-out matched/skipped counts).

**PDP enrichment** for CC is supported via `POST /enrich` only (`competitivecyclist` enricher in `parsers/competitivecyclist.ts`, Backcountry-family Cheerio helpers). The API includes CC in `StoreTypesWithEnrichers` for nightly enrichment and admin **Enrich** actions. Monitor fetch success rates — CC may block datacenter HTTP like other Backcountry-family sites.

> > > > > > > @{-1}

## Endpoints

| Endpoint  | Method | Purpose                                           |
| --------- | ------ | ------------------------------------------------- |
| `/scrape` | POST   | Scrape sale page; returns `ScrapeResult[]`        |
| `/enrich` | POST   | Visit PDP URL; returns specs, category_path, etc. |
| `/health` | GET    | Health check (no auth)                            |

### Error monitoring (Sentry)

When `SENTRY_DSN` is set (production should set it), new routes that can fail with 5xx must report via `captureRouteError` or `next(err)` + `setupExpressErrorHandler`—not only `console.error`. Policy: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Parser Structure

Parsers live in `src/parsers/` — one file per store:

- `jensonusa.ts` — JensonUSA sale + enrichment
- `worldwidecyclery.ts` — Worldwide Cyclery
- `revelbikes.ts` — Revel Bikes (Shopify collection JSON + PDP enrich via `/products/{handle}.json`; specs from `body_html` `<strong>KEY:</strong><br>value` paragraphs)
- `backcountry.ts` — Backcountry (Backcountry-family React PLP; shared logic in `backcountry-family-plp.ts`)
- `competitivecyclist.ts` — Competitive Cyclist (**enrich only**; ingest is Impact catalog on the API)
- `ridebicycles.ts` — Ride Bicycles (Shopify JSON API; in-stock + ≥10% off compare-at)
- `thundermountainbikes.ts` — Thunder Mountain Bikes (Shopify collection JSON + PDP enrich like Worldwide Cyclery)

`parsers/index.ts` registers `PARSERS` and `ENRICHERS` maps. Enrichers fetch product detail pages (PDP) for category paths and specs.

## Adding a New Store

1. Create parser in `src/parsers/<store>.ts`
2. Export `scrape<Store>` and optionally `enrich<Store>`
3. Add to `PARSERS` and `ENRICHERS` in `parsers/index.ts`
4. Add store enum value to `ScrapeRequestSchema` in `types.ts` (and `EnrichRequestSchema` / `ENRICH_STORE_TYPES` if enrich-only)
5. Insert store record in DB (via admin or seed)

## ScrapeResult Shape

```ts
{
  store_sku: string;
  product_name: string;
  current_price: number;
  original_price: number | null;
  product_url: string;
  image_url: string | null;
  brand: string | null;
  category_path: string[] | null;
  is_in_stock: boolean;
  // Shopify stores: product handle + per-variant options (Size, Color, …)
  product_group_key?: string | null;
  variant_options?: Record<string, string> | null;
}
```

**JensonUSA** (`jensonusa.ts`): clearance cards expose `variants[]` inside `data-product-result-dto` (after page hydration). The parser emits **one row per variant** with `store_sku` = `variant.code`, `product_group_key` = parent `dto.code`, and `variant_options` from whatever facet fields exist on the **listing** DTO (often **Color only**; Size and other axes may be missing). **PDP enrichment** (`enrichJensonUSA`) parses `serverSideViewModel.variants` from the product page HTML and returns a `variants` array (`code`, `dimensions`, `is_orderable`); the API fans that out to every sibling row with the same `product_group_key` (one PDP fetch per parent). Parser modules: `jensonusa-dto.ts`, `jensonusa-pdp.ts`, tests `jensonusa-dto*.test.ts`, `jensonusa-pdp-variants.test.ts`.

Shopify parsers (`ridebicycles`, `worldwidecyclery`, `revelbikes`, `thundermountainbikes`) emit one row per variant; the API stores `product_group_key` as `{store_id}:{handle}` and `variant_options` as JSON for deduplication and filters. Shared helpers: `parsers/shopify-helpers.ts`.

## Running

```bash
# From repo root
pnpm --filter @mtb-aggregator/scraper run dev
```

## Testing

```bash
pnpm --filter @mtb-aggregator/scraper run test
pnpm --filter @mtb-aggregator/scraper run test:watch
```

## Manual Test (API + scraper running)

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.jensonusa.com/clearance", "store": "jensonusa"}'
```
