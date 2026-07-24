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
- One file per store: `jensonusa.ts`, `worldwidecyclery.ts`, `revelbikes.ts`, `backcountry.ts`, `ridebicycles.ts`, `thundermountainbikes.ts`, `mackcycle.ts`, `rideconcepts.ts`, `leatt.ts`, `chromag.ts`, `gravitycartel.ts`, `bikesonline.ts`, `evo.ts`, `cambriabikes.ts`, `365cycles.ts`, `thelostco.ts`, `hayes.ts`, `raceface.ts`, `ion.ts`, `canyon.ts` (+ `canyon-plp.ts`, `canyon-pdp.ts`); `specialized.ts` (+ `specialized-plp.ts`, `specialized-pdp.ts`); `trek.ts` (+ `trek-plp.ts`, `trek-pdp.ts`); `universalcycles.ts` (+ `universalcycles-plp.ts`, `universalcycles-pdp.ts`); `n1bikes.ts` (+ `n1bikes-plp.ts`, `n1bikes-pdp.ts`); `foxracing.ts` (+ `foxracing-plp.ts`, `foxracing-pdp.ts`); `bell.ts` (+ `bell-plp.ts`, `bell-pdp.ts`); `giro.ts` (+ `giro-plp.ts`, `giro-pdp.ts`); shared Backcountry-family sale PLP evaluator: `backcountry-family-plp.ts`, PDP parsers: `backcountry-family-pdp.ts`
- **Registration**: `parsers/index.ts` exports `PARSERS` and `ENRICHERS` maps

### Adding a New Store

1. Create `parsers/{storename}.ts` with:
   - `scrape{StoreName}(url: string): Promise<ScrapeResult[]>` — sale page parser
   - `enrich{StoreName}(url: string): Promise<EnrichResult>` — PDP parser (if store has detail pages)
2. Add store to `STORE_TYPES` in `types.ts`
3. Register in `parsers/index.ts`: `PARSERS` and optionally `ENRICHERS`
4. Insert store record in DB (`stores` table) with `store_type` matching the key

### Test fixtures and CI (gitleaks)

Vitest fixtures live under `apps/scraper/src/parsers/__fixtures__/`. When you save captured retailer HTML/JSON:

1. **Sanitize third-party widget keys** before commit. Demandware PDP pages often embed `var yotpoAppKey = '…'` (Yotpo reviews). CI runs **gitleaks** on every PR; a real site key triggers `generic-api-key` and fails the build. Replace with the repo placeholder (same as Bell / Fox Racing):

   ```js
   var yotpoAppKey = 'fixture-yotpo-app-key-not-real';
   ```

2. **Prefer trimmed snippets** when possible (accordion + swatches + breadcrumbs) instead of full page dumps — smaller diffs and fewer accidental secrets.

3. **Optional local check** before push (if `gitleaks` is installed):

   ```bash
   gitleaks detect --source . --verbose --redact
   ```

   CI uses [`.gitleaks.toml`](../.gitleaks.toml) to allowlist `__fixtures__/` paths (false positives on sanitized captures still happen if a live key lands in an earlier PR commit — gitleaks scans the full PR range). Always sanitize **before** the first push.

This failure has recurred on each new Demandware store (Fox Racing #138, Bell #140, Giro #142) when fixtures were copied verbatim from live PDP HTML.

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
- **Chromag** (`chromag`): Shopify collection `products.json` on `/collections/sale` + **PDP enrichment** (`enrichChromag`) mirroring Leatt / Mack Cycle. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-chromag` / `make enrich-now-chromag`.
- **The Gravity Cartel** (`gravitycartel`): Shopify collection `products.json` on `/collections/sale` + **PDP enrichment** (`enrichGravityCartel`) mirroring Mack Cycle. **In-stock variants only** — the sale page lists many sold-out SKUs. Emits one row per available variant with `product_group_key` and `variant_options`. `make scrape-now-gravitycartel` / `make enrich-now-gravitycartel`.
- **Bikes Online** (`bikesonline`): Shopify collection `products.json` on `/collections/sale` + **PDP enrichment** (`enrichBikesOnline`) mirroring Mack Cycle / Chromag. Filters package-protection add-ons from the sale feed. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-bikesonline` / `make enrich-now-bikesonline`.
- **Evo** (`evo`): Shopify collection `products.json` on `/collections/bike-sale` + **PDP enrichment** (`enrichEvo`) mirroring Mack Cycle / Chromag. Cloudflare blocks plain `fetch`; the scraper uses Playwright to establish a session before calling `products.json` and product PDP JSON/HTML. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-evo` / `make enrich-now-evo`.
- **Cambria Bikes** (`cambriabikes`): Shopify collection `products.json` on `/collections/all-sale-products` + **PDP enrichment** (`enrichCambriaBikes`) mirroring Chromag / Mack Cycle. Fetch uses browser-like User-Agent, Referer, paced pagination (`CAMBRIABIKES_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-cambriabikes` / `make enrich-now-cambriabikes`.
- **365 Cycles** (`365cycles`): Shopify collection `products.json` on `/collections/shopify-sale` + **PDP enrichment** (`enrich365Cycles`) mirroring Cambria Bikes / Chromag. Fetch uses browser-like User-Agent, Referer, paced pagination (`CYCLES365_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-365cycles` / `make enrich-now-365cycles`.
- **The Lost Co** (`thelostco`): Shopify collection `products.json` on `/collections/clearance-mountain-bike-parts` + **PDP enrichment** (`enrichTheLostCo`) mirroring Cambria Bikes / 365 Cycles. Fetch uses browser-like User-Agent, Referer, paced pagination (`THELOSTCO_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503 (Cloudflare). Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-thelostco` / `make enrich-now-thelostco`.
- **Hayes** (`hayes`): Shopify collection `products.json` on `/collections/outlet` + **PDP enrichment** (`enrichHayes`) mirroring Cambria Bikes / The Lost Co. Fetch uses browser-like User-Agent, Referer, paced pagination (`HAYES_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-hayes` / `make enrich-now-hayes`.
- **Race Face** (`raceface`): Shopify collection `products.json` on `/collections/outlet-sale` + **PDP enrichment** (`enrichRaceFace`) mirroring Hayes. Fetch uses browser-like User-Agent, Referer, paced pagination (`RACEFACE_PAGE_DELAY_MS`, default 500ms), and retries on 403/429/503. Emits one row per variant with `product_group_key` and `variant_options`. `make scrape-now-raceface` / `make enrich-now-raceface`.
- **ION** (`ion`): Custom Nuxt storefront (Boards & More) with Shopify checkout — **not** standard `/collections/.../products.json`. Sale page SSR embeds article numbers; scrape uses `ion-products.com` `/api/product/{articleNumber}` + regional availability for US PDP URLs, and Shopify Storefront GraphQL (`secure-us.ion-products.com`, fallback `secure.ion-products.com`) for USD sale pricing (`compareAtPrice`). Emits discounted variants only with `product_group_key` = article number. PDP enrich via `/api/product/{articleNumber}`. `make scrape-now-ion` / `make enrich-now-ion`.
- **Competitive Cyclist** is **`store_type=competitivecyclist` in the DB**. Listing rows come from the **Impact Partner catalog API** inside the Go scheduler (`internal/impact`) when `IMPACT_ACCOUNT_SID` and `IMPACT_AUTH_TOKEN` are set. The seed `scrape_url` remains a human-readable “intent” (bikes on sale). Use `make impact-catalog-probe` to inspect catalogs and sample items. Outbound **`affiliate_url`** uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set; otherwise the catalog row **`Url`** when it’s an Impact tracking hop. **PDP enrichment** runs via the scraper `POST /enrich` using **Playwright**; JSON-LD **`hasVariant`** sets **`product_group_key`** / **`variant_options`** on matching catalog SKUs so **`group_variants=true`** collapses siblings (`make backfill-cc-variants` for existing rows). CC PDPs are behind **AWS WAF** — you must bootstrap **`apps/scraper/cc-storage.json`** locally and configure **`SCRAPER_STORAGE_STATE`** on the scraper (see [apps/scraper/README.md](../apps/scraper/README.md#competitive-cyclist) for codegen / headed / Render secret-file steps).
- **Canyon** (`canyon`): **fetch + Cheerio** against the US sale Demandware ajax product grid (`Search-IncludeProductGrid`, `start`/`sz` pagination). **PDP enrichment** fetches HTML and parses JSON-LD `Product` + breadcrumbs. No Playwright or affiliate URL in MVP. `make scrape-now-canyon` / `make enrich-now-canyon`.
- **Specialized** (`specialized`): **fetch** against RPC `searchProducts` on the US sale PLP (HTML `code` token + `page` 1…N, 96 per page). One listing row per color swatch (`store_sku` = `swatchesJSON[].id`, `product_group_key` = product id). **PDP enrichment** uses microdata breadcrumbs, `og:description`, and technical-spec DOM. No affiliate URL in MVP. `make scrape-now-specialized` / `make enrich-now-specialized`.
- **Trek** (`trek`): **fetch** against SAP Commerce OCC `categories/B300/products?query=:relevance:saleFlag:true` (~23 MTB sale SKUs today) plus PLP HTML merge for `wasPriceRange` / MSRP. One listing row per product code (`store_sku` = OCC `code`). **PDP enrichment** uses static breadcrumbs and `og:description` (spec DOM is client-rendered). No affiliate URL in MVP. `make scrape-now-trek` / `make enrich-now-trek`.
- **Universal Cycles** (`universalcycles`): **fetch + Cheerio** against `specials.php` (~615 sale products, paginated with `?resultpage=N`). One parent listing row per product id (`store_sku` = `id` query param). **PDP enrichment** parses `#attribute_{id}` blocks and returns `variants[]` with composite SKUs (`{productId}-{attributeId}`), per-variant prices/stock, and shared description/specs from `#PageContent`. The API upserts attribute rows and hides the parent (`internal/db/uc_pdp_variants.go`); apply migration `026_universalcycles_hide_superseded_parent_listings.sql` after first enrich backfill. Out-of-stock attributes stay as rows with `is_in_stock=false` (Jenson pattern). No Playwright or affiliate URL in MVP. `make scrape-now-universalcycles` / `make enrich-now-universalcycles`.
- **N+1 Bikes** (`n1bikes`): **fetch** against the public MasterLinq catalog API (`POST https://storefrontapi.masterlinq.io/api/ecom/catalog/search` with `x-account-code: LKY`, paginated via `continuationToken`). Sale filter mirrors the storefront PLP (`discountAtOrAbove` from `?discount=` on the seed URL, default 20%). One listing row per discounted variant (`store_sku` = variant SKU, `product_group_key` = product group id). Sale price uses variant `map` vs `msrp`; **online stock** sums supplier warehouse inventory (`totalInventoryByProduct`, e.g. QBP locations) rather than retail pickup availability shown on the site. **PDP enrichment** fetches HTML and parses embedded `specifications` JSON plus `og:description`. No Playwright or affiliate URL in MVP. `make scrape-now-n1bikes` / `make enrich-now-n1bikes`.
- **Fox Racing** (`foxracing`): **fetch + Cheerio** against the US MTB legacy-drops Demandware ajax grid (`Search-UpdateGrid` on `cgid=sale-mtb`, `start`/`sz=60` pagination). One listing row per color variant tile (`store_sku` = `data-pid`, `product_group_key` = base style id `VG-#####`). **PDP enrichment** fetches HTML, parses microdata breadcrumbs plus accordion Description / Key Features / Specifications, and returns `variants[]` per color swatch; the API fans out human-readable `Color` labels and `is_in_stock` to sibling listings (`ApplyFoxRacingPDPVariantFanout`). `GET /deals?group_variants=true` collapses color siblings into one card. No Playwright or affiliate URL in MVP. `make scrape-now-foxracing` / `make enrich-now-foxracing`.
- **Bell** (`bell`): **fetch + Cheerio** against the US cycling legacy-garage Demandware ajax grid (`Search-UpdateGrid` on `Sites-BellUS-Site`, `cgid=legacy-garage-cycling`, `start`/`sz=60` pagination). One listing row per color variant tile (`store_sku` = `BL-#####` `data-pid`, `product_group_key` = master product id from the PDP URL path). **PDP enrichment** fetches HTML, parses microdata breadcrumbs plus accordion Description / Key Features / Specifications, and returns `variants[]` per color swatch (variant `code` = color id); the API fans out human-readable `Color` labels and `is_in_stock` to sibling listings (`ApplyBellPDPVariantFanout`). `GET /deals?group_variants=true` collapses color siblings. No Playwright or affiliate URL in MVP. `make scrape-now-bell` / `make enrich-now-bell`.
- **Giro** (`giro`): **fetch + Cheerio** against the US cycling archives Demandware ajax grid (`Search-UpdateGrid` on `Sites-GiroUS-Site`, `cgid=archive-cycling`, `start`/`sz=60` pagination). One listing row per color variant tile (`store_sku` = `data-pid`, `product_group_key` = master product id from the PDP URL path). **PDP enrichment** fetches HTML, parses microdata breadcrumbs plus accordion Description / Key Features / Specifications, and returns `variants[]` per color swatch; the API fans out human-readable `Color` labels and `is_in_stock` to sibling listings (`ApplyGiroPDPVariantFanout`). `GET /deals?group_variants=true` collapses color siblings. No Playwright or affiliate URL in MVP. `make scrape-now-giro` / `make enrich-now-giro`.
