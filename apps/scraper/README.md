# MTB Aggregator Scraper

Node.js Express server using Playwright to scrape retailer sale pages. Returns structured listings and supports PDP enrichment for specs and category paths.

## Overview

- **Port:** 3000 (default)
- **Runtime:** Node.js 20+, TypeScript
- **Scraping:** Playwright (Chromium); needed for JS-rendered pages (e.g. JensonUSA)
- **Testing:** Set `SCRAPER_MAX_PRODUCTS=10` to limit products per scrape (0 = no limit)

## Environment

| Variable | Purpose |
|----------|---------|
| `SCRAPER_SERVICE_SECRET` | Optional locally; **set in production** (same value as the API). When set, `POST /scrape`, `POST /enrich`, and `POST /scrape-debug` require `X-Scraper-Secret` or `Authorization: Bearer <secret>`. `GET /health` stays open for load balancers. |
| `SENTRY_DSN` | Optional; enables [Sentry](https://docs.sentry.io/platforms/javascript/guides/express/) (`src/bootstrap.ts`, `expressIntegration`, `setupExpressErrorHandler`). Same name as the API; use a dedicated Sentry **Node** project for the scraper. |
| `SENTRY_ENVIRONMENT` | e.g. `production` |
| `SENTRY_RELEASE` / `RENDER_GIT_COMMIT` | Release grouping on Render |

Scrape/enrich failures call `captureRouteError` (tags: `route`, `store`) because handlers use `try`/`catch` instead of `next(err)`.

**Convention:** When `SENTRY_DSN` is set (production should set it), new routes that can fail with 5xx must report via `captureRouteError` or `next(err)` + `setupExpressErrorHandler`—not only `console.error`. Policy: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/scrape` | POST | Scrape sale page; returns `ScrapeResult[]` |
| `/enrich` | POST | Visit PDP URL; returns specs, category_path, etc. |
| `/health` | GET | Health check (no auth) |

## Parser Structure

Parsers live in `src/parsers/` — one file per store:

- `jensonusa.ts` — JensonUSA sale + enrichment
- `worldwidecyclery.ts` — Worldwide Cyclery
- `revelbikes.ts` — Revel Bikes (scrape only)
- `backcountry.ts` — Backcountry
- `ridebicycles.ts` — Ride Bicycles (Shopify JSON API; in-stock + ≥10% off compare-at)

`parsers/index.ts` registers `PARSERS` and `ENRICHERS` maps. Enrichers fetch product detail pages (PDP) for category paths and specs.

## Adding a New Store

1. Create parser in `src/parsers/<store>.ts`
2. Export `scrape<Store>` and optionally `enrich<Store>`
3. Add to `PARSERS` and `ENRICHERS` in `parsers/index.ts`
4. Add store enum value to `ScrapeRequestSchema` / `EnrichRequestSchema` in `types.ts`
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

**JensonUSA** (`jensonusa.ts`): clearance cards expose `variants[]` inside `data-product-result-dto` (after page hydration). The parser emits **one row per variant** with `store_sku` = `variant.code`, `product_group_key` = parent `dto.code`, and `variant_options` built from facet fields on each variant (e.g. `color` string, `size: { value, sortOrder }`, or any other non-price field). Parsing logic and tests: `jensonusa-dto.ts`, `jensonusa-dto.test.ts`, `jensonusa-dto-variants.test.ts`.

Shopify parsers (`ridebicycles`, `worldwidecyclery`, `revelbikes`) emit one row per variant; the API stores `product_group_key` as `{store_id}:{handle}` and `variant_options` as JSON for deduplication and filters. Shared helpers: `parsers/shopify-helpers.ts`.

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
