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
- **One file per store**: `jensonusa.ts`, `worldwidecyclery.ts`, `revelbikes.ts`, `backcountry.ts`, `ridebicycles.ts`, `thundermountainbikes.ts`, `mackcycle.ts`, `rideconcepts.ts`, `leatt.ts`, `canyon.ts` (+ `canyon-plp.ts`, `canyon-pdp.ts`); `specialized.ts` (+ `specialized-plp.ts`, `specialized-pdp.ts`); `trek.ts` (+ `trek-plp.ts`, `trek-pdp.ts`); `universalcycles.ts` (+ `universalcycles-plp.ts`, `universalcycles-pdp.ts`); `n1bikes.ts` (+ `n1bikes-plp.ts`, `n1bikes-pdp.ts`); `foxracing.ts` (+ `foxracing-plp.ts`, `foxracing-pdp.ts`); shared Backcountry-family sale PLP evaluator: `backcountry-family-plp.ts`, PDP parsers: `backcountry-family-pdp.ts`
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
- **Ride Bicycles**: Uses Shopify `products.json` on the `all-products` collection (storefront `rb_*` query params are not honored by the API). Fetch uses **browser-like User-Agent**, **Referer**, paced pagination (`RIDEBICYCLES_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503. Parser keeps in-stock variants with compare-at and **≥15%** off compare-at (≤75% cap for bulk/case pricing artifacts).
- **Revel Bikes**: Same Shopify collection `products.json` scrape as other stores. **PDP enrichment** (`enrichRevelBikes`): `GET /products/{handle}.json`, then parse `body_html` for spec paragraphs `<p><strong>KEY:</strong><br>value</p>` into `raw_specs`, with remaining prose as `description`. `category_path` uses `product_type` when Shopify sets it (often empty on sale SKUs). Canonical categories still come from the **API’s generic LLM classifier**, not the enricher.
- **Thunder Mountain Bikes**: Shopify collection `products.json` + **PDP enrichment** (`enrichThunderMountainBikes`) mirroring Worldwide Cyclery: product JSON + HTML for breadcrumbs; `raw_specs` from tables / definition lists in `body_html`.
- **Mack Cycle** (`mackcycle`): Shopify collection `products.json` on `/collections/sale` + **PDP enrichment** (`enrichMackCycle`) mirroring Worldwide Cyclery. No affiliate URL in MVP. `make scrape-now-mackcycle` / `make enrich-now-mackcycle`.
- **Ride Concepts** (`rideconcepts`): Shopify collection `products.json` on `/collections/on-sale` + **PDP enrichment** (`enrichRideConcepts`) mirroring Mack Cycle / Thunder Mountain. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-rideconcepts` / `make enrich-now-rideconcepts`.
- **Leatt** (`leatt`): Shopify collection `products.json` on `/collections/mtb-hot-deals` + **PDP enrichment** (`enrichLeatt`) mirroring Mack Cycle / Ride Concepts. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-leatt` / `make enrich-now-leatt`.
- **Competitive Cyclist** is **`store_type=competitivecyclist` in the DB**. Listing rows come from the **Impact Partner catalog API** inside the Go scheduler (`internal/impact`) when `IMPACT_ACCOUNT_SID` and `IMPACT_AUTH_TOKEN` are set. The seed `scrape_url` remains a human-readable “intent” (bikes on sale). Use `make impact-catalog-probe` to inspect catalogs and sample items. Outbound **`affiliate_url`** uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set; otherwise the catalog row **`Url`** when it’s an Impact tracking hop. **PDP enrichment** runs via the scraper `POST /enrich` using **Playwright**; JSON-LD **`hasVariant`** sets **`product_group_key`** / **`variant_options`** on matching catalog SKUs so **`group_variants=true`** collapses siblings (`make backfill-cc-variants` for existing rows). CC PDPs are behind **AWS WAF** — you must bootstrap **`apps/scraper/cc-storage.json`** locally and configure **`SCRAPER_STORAGE_STATE`** on the scraper (see [apps/scraper/README.md](../apps/scraper/README.md#competitive-cyclist) for codegen / headed / Render secret-file steps).
- **Canyon** (`canyon`): **fetch + Cheerio** against the US sale Demandware ajax product grid (`Search-IncludeProductGrid`, `start`/`sz` pagination). **PDP enrichment** fetches HTML and parses JSON-LD `Product` + breadcrumbs. No Playwright or affiliate URL in MVP. `make scrape-now-canyon` / `make enrich-now-canyon`.
- **Specialized** (`specialized`): **fetch** against persisted GraphQL `SEARCH_PRODUCT_DATA` on the US sale PLP (`page` 1–7, 96 per page, ~630 clearance SKUs). One listing row per color swatch (`store_sku` = `swatchesJSON[].id`, `product_group_key` = product id). **PDP enrichment** uses microdata breadcrumbs, `og:description`, and technical-spec DOM. No affiliate URL in MVP. `make scrape-now-specialized` / `make enrich-now-specialized`.
- **Trek** (`trek`): **fetch** against SAP Commerce OCC `categories/B300/products?query=:relevance:saleFlag:true` (~23 MTB sale SKUs today) plus PLP HTML merge for `wasPriceRange` / MSRP. One listing row per product code (`store_sku` = OCC `code`). **PDP enrichment** uses static breadcrumbs and `og:description` (spec DOM is client-rendered). No affiliate URL in MVP. `make scrape-now-trek` / `make enrich-now-trek`.
- **Universal Cycles** (`universalcycles`): **fetch + Cheerio** against `specials.php` (~615 sale products, paginated with `?resultpage=N`). One parent listing row per product id (`store_sku` = `id` query param). **PDP enrichment** parses `#attribute_{id}` blocks and returns `variants[]` with composite SKUs (`{productId}-{attributeId}`), per-variant prices/stock, and shared description/specs from `#PageContent`. The API upserts attribute rows and hides the parent (`internal/db/uc_pdp_variants.go`); apply migration `026_universalcycles_hide_superseded_parent_listings.sql` after first enrich backfill. Out-of-stock attributes stay as rows with `is_in_stock=false` (Jenson pattern). No Playwright or affiliate URL in MVP. `make scrape-now-universalcycles` / `make enrich-now-universalcycles`.
- **N+1 Bikes** (`n1bikes`): **fetch** against the public MasterLinq catalog API (`POST https://storefrontapi.masterlinq.io/api/ecom/catalog/search` with `x-account-code: LKY`, paginated via `continuationToken`). Sale filter mirrors the storefront PLP (`discountAtOrAbove` from `?discount=` on the seed URL, default 20%). One listing row per discounted variant (`store_sku` = variant SKU, `product_group_key` = product group id). Sale price uses variant `map` vs `msrp`; **online stock** sums supplier warehouse inventory (`totalInventoryByProduct`, e.g. QBP locations) rather than retail pickup availability shown on the site. **PDP enrichment** fetches HTML and parses embedded `specifications` JSON plus `og:description`. No Playwright or affiliate URL in MVP. `make scrape-now-n1bikes` / `make enrich-now-n1bikes`.
- **Fox Racing** (`foxracing`): **fetch + Cheerio** against the US MTB legacy-drops Demandware ajax grid (`Search-UpdateGrid` on `cgid=sale-mtb`, `start`/`sz=60` pagination). One listing row per color variant tile (`store_sku` = `data-pid`, `product_group_key` = base style id `VG-#####`). **PDP enrichment** fetches HTML, parses microdata breadcrumbs plus accordion Description / Key Features / Specifications, and returns `variants[]` per color swatch; the API fans out human-readable `Color` labels and `is_in_stock` to sibling listings (`ApplyFoxRacingPDPVariantFanout`). `GET /deals?group_variants=true` collapses color siblings into one card. No Playwright or affiliate URL in MVP. `make scrape-now-foxracing` / `make enrich-now-foxracing`.
