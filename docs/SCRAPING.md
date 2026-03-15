# Scraper Service Deep Dive

The scraper is a Node.js Express server that uses Playwright to scrape MTB retailer sale pages and product detail pages.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/scrape` | POST | Scrape sale page → returns `ScrapeResult[]` |
| `/enrich` | POST | Visit PDP URLs → returns `EnrichResult` (category, specs) |
| `/health` | GET | Health check |

## Parser Structure

- **Location**: `apps/scraper/src/parsers/`
- **One file per store**: `jensonusa.ts`, `worldwidecyclery.ts`, `revelbikes.ts`, `backcountry.ts`
- **Registration**: `parsers/index.ts` exports `PARSERS` and `ENRICHERS` maps

### Adding a New Store

1. Create `parsers/{storename}.ts` with:
   - `scrape{StoreName}(url: string): Promise<ScrapeResult[]>` — sale page parser
   - `enrich{StoreName}(url: string): Promise<EnrichResult>` — PDP parser (if store has detail pages)
2. Add store to `STORE_TYPES` in `types.ts`
3. Register in `parsers/index.ts`: `PARSERS` and optionally `ENRICHERS`
4. Insert store record in DB (`stores` table) with `store_type` matching the key

### ScrapeResult Schema

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

## Testing

```bash
pnpm --filter @mtb-aggregator/scraper run test
pnpm --filter @mtb-aggregator/scraper run test:watch
```

Manual scrape (scraper must be running):

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.jensonusa.com/clearance", "store": "jensonusa"}'
```

## Notes

- **Chromium**: Scraper needs ~300MB+ RAM; use Render Standard (2GB) in production, not free tier
- **Timeouts**: Configure via `SCRAPER_MAX_PAGES` and Playwright timeouts
- **Store types**: Must match keys in `PARSERS` and `ENRICHERS`
