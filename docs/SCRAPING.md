# Scraper Service Deep Dive

The scraper is a Node.js Express server that uses Playwright to scrape MTB retailer sale pages and product detail pages.

## Endpoints

| Endpoint  | Method | Purpose                                                   |
| --------- | ------ | --------------------------------------------------------- |
| `/scrape` | POST   | Scrape sale page → returns `ScrapeResult[]`               |
| `/enrich` | POST   | Visit PDP URLs → returns `EnrichResult` (category, specs) |
| `/health` | GET    | Health check (no auth)                                    |

When `SCRAPER_SERVICE_SECRET` is set (recommended in production), `POST /scrape` and `POST /enrich` require `X-Scraper-Secret` or `Authorization: Bearer` matching the API’s env. The Go API sends this header automatically.

## Parser Structure

- **Location**: `apps/scraper/src/parsers/`
- **One file per store**: `jensonusa.ts`, `worldwidecyclery.ts`, `revelbikes.ts`, `backcountry.ts`, `ridebicycles.ts`, `thundermountainbikes.ts`; shared Backcountry-family sale PLP evaluator: `backcountry-family-plp.ts`, PDP parsers: `backcountry-family-pdp.ts`
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
  product_group_key?: string | null; // optional: Shopify handle or Jenson parent product code
  variant_options?: Record<string, string> | null; // e.g. { Color: "Black", Size: "8.5" }
}
```

**JensonUSA:** Each clearance product card’s `data-product-result-dto` includes a `variants` array (in addition to `selectedVariant`). The parser emits one result per variant so each sale price and SKU is stored; `product_group_key` is the parent `code`, and listing-side `variant_options` reflect whatever facets exist on the card (often **Color** only). **Full variant labels (e.g. Size) and per-variant stock** come from the PDP: the scraper’s `POST /enrich` for JensonUSA returns `variants[]` parsed from `serverSideViewModel.variants`, and the API updates all sibling rows for that `product_group_key`. After the first deploy with per-variant scrape rows, apply migration `025_jenson_hide_superseded_parent_listings.sql` so legacy parent-`store_sku` rows are hidden when longer variant SKUs exist on the same `product_url`.

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

- **Service auth**: Set `SCRAPER_SERVICE_SECRET` to the same value on the API and scraper in production (see [apps/scraper/README.md](../apps/scraper/README.md)).
- **Sentry**: Optional `SENTRY_DSN` locally; **set in production** and report 5xx route failures to Sentry (see [apps/scraper/README.md](../apps/scraper/README.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md#error-monitoring-sentry))
- **Chromium**: Scraper needs ~300MB+ RAM; use Render Standard (2GB) in production, not free tier
- **Timeouts**: Configure via `SCRAPER_MAX_PAGES` and Playwright timeouts
- **Testing**: Set `SCRAPER_MAX_PRODUCTS=10` (or similar) to limit products per scrape; 0 = no limit
- **Store types**: Must match keys in `PARSERS` / `ENRICHERS`. **Competitive Cyclist** is **enrich-only** in the Node scraper (`competitivecyclist` in `ENRICHERS`, not `PARSERS`); listing ingest is the Impact catalog API on the Go scheduler.
- **Ride Bicycles**: Uses Shopify products.json API; parser keeps in-stock variants with compare-at price and **≥10%** off compare-at (rb_stock_status, rb_discount_relative are not honored by the API)
- **Revel Bikes**: Same Shopify collection `products.json` scrape as other stores. **PDP enrichment** (`enrichRevelBikes`): `GET /products/{handle}.json`, then parse `body_html` for spec paragraphs `<p><strong>KEY:</strong><br>value</p>` into `raw_specs`, with remaining prose as `description`. `category_path` uses `product_type` when Shopify sets it (often empty on sale SKUs). Canonical categories still come from the **API’s generic LLM classifier**, not the enricher.
- **Thunder Mountain Bikes**: Shopify collection `products.json` + **PDP enrichment** (`enrichThunderMountainBikes`) mirroring Worldwide Cyclery: product JSON + HTML for breadcrumbs; `raw_specs` from tables / definition lists in `body_html`.
- **Competitive Cyclist** is **`store_type=competitivecyclist` in the DB**. Listing rows come from the **Impact Partner catalog API** inside the Go scheduler (`internal/impact`) when `IMPACT_ACCOUNT_SID` and `IMPACT_AUTH_TOKEN` are set. The seed `scrape_url` remains a human-readable “intent” (bikes on sale). Use `make impact-catalog-probe` to inspect catalogs and sample items. Outbound **`affiliate_url`** uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set; otherwise the catalog row **`Url`** when it’s an Impact tracking hop. **PDP enrichment** runs via the scraper `POST /enrich` using **Playwright**; JSON-LD **`hasVariant`** sets **`product_group_key`** / **`variant_options`** on matching catalog SKUs so **`group_variants=true`** collapses siblings (`make backfill-cc-variants` for existing rows). CC PDPs are behind **AWS WAF** — you must bootstrap **`apps/scraper/cc-storage.json`** locally and configure **`SCRAPER_STORAGE_STATE`** on the scraper (see [apps/scraper/README.md](../apps/scraper/README.md#competitive-cyclist) for codegen / headed / Render secret-file steps).
