# MTB Aggregator Scraper

Node.js Express server using Playwright to scrape retailer sale pages. Returns structured listings and supports PDP enrichment for specs and category paths.

## Overview

- **Port:** 3000 (default)
- **Runtime:** Node.js 20+, TypeScript
- **Scraping:** Playwright (Chromium); needed for JS-rendered pages (e.g. JensonUSA)
- **Testing:** Set `SCRAPER_MAX_PRODUCTS=10` to limit products per scrape (0 = no limit)

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/scrape` | POST | Scrape sale page; returns `ScrapeResult[]` |
| `/enrich` | POST | Visit PDP URL; returns specs, category_path, etc. |
| `/health` | GET | Health check |

## Parser Structure

Parsers live in `src/parsers/` — one file per store:

- `jensonusa.ts` — JensonUSA sale + enrichment
- `worldwidecyclery.ts` — Worldwide Cyclery
- `revelbikes.ts` — Revel Bikes (scrape only)
- `backcountry.ts` — Backcountry
- `ridebicycles.ts` — Ride Bicycles (Shopify JSON API; filters in-stock + discounted)

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
}
```

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
