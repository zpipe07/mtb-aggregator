# MTB Aggregator Scraper

Node.js Express server using Playwright to scrape retailer sale pages. Returns structured listings and supports PDP enrichment for specs and category paths.

## Overview

- **Port:** 3000 (default)
- **Runtime:** Node.js 20+, TypeScript
- **Scraping:** Playwright (Chromium); needed for JS-rendered pages (e.g. JensonUSA)
- **Testing:** Set `SCRAPER_MAX_PRODUCTS=10` to limit products per scrape (0 = no limit)

## Environment

| Variable                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCRAPER_SERVICE_SECRET`               | Optional locally; **set in production** (same value as the API). When set, `POST /scrape`, `POST /enrich`, and `POST /scrape-debug` require `X-Scraper-Secret` or `Authorization: Bearer <secret>`. `GET /health` stays open for load balancers.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SENTRY_DSN`                           | **Required in production** (Render scraper). Enables [Sentry](https://docs.sentry.io/platforms/javascript/guides/express/) (`src/bootstrap.ts`, `expressIntegration`, `setupExpressErrorHandler`). Use a dedicated Sentry **Node** project for the scraper (not the API or web DSN). `/scrape` and `/enrich` call `captureRouteError` on 5xx.                                                                                                                                                                                                                                                                                                                                               |
| `SENTRY_ENVIRONMENT`                   | e.g. `production`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SENTRY_RELEASE` / `RENDER_GIT_COMMIT` | Release grouping on Render                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `BROWSER_USER_AGENT`                   | Chrome-like UA for Playwright (Backcountry). Default is desktop Chrome; **do not** use `MTBDealBot` here — it triggers AWS WAF.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SCRAPER_STORAGE_STATE`                | Path to Playwright **storage state** JSON (cookies/localStorage) after you pass WAF in a real browser. Helps **Backcountry** PLP scrape and **Competitive Cyclist PDP enrich** in some environments. CC listing ingest runs via the Impact catalog API on the Go API (see [apps/api/README.md](../api/README.md)); the scraper is not used for CC production ingest. Use an **absolute path** in production (e.g. Render secret file mount `/etc/secrets/cc-storage.json`). Set this on the **scraper** service, not only the API. Startup logs print `env`, `resolved`, and `cwd` so you can verify the running value. If the file is missing, enrich continues without cookies (no crash). |
| `SCRAPER_WAF_WAIT_MS`                  | Max wait for WAF challenge to clear (default `120000`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SCRAPER_HEADED`                       | Set `1` to run a visible Chromium window (sometimes passes WAF when headless fails).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `BROWSER_IDLE_CLOSE_MS`                | Idle time before closing a shared Chromium instance between sequential `/enrich` or Playwright scrape calls (default **60000**). Reusing the browser avoids relaunching Chromium on every PDP (~15–30s saved per listing).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `RIDEBICYCLES_PAGE_DELAY_MS`           | Delay between Ride Bicycles collection `products.json` pages during scrape (default **500**). Uses `BROWSER_USER_AGENT` + retries on 403/429/503 (not `MTBDealBot`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Backcountry (AWS WAF)

Backcountry can serve a **“Human Verification”** page to automated browsers. If scrape logs show tiny HTML / `gokuProps` and no products, the PLP never loaded.

**Fix:** save Playwright storage state after passing WAF in a real session, point `SCRAPER_STORAGE_STATE` at that JSON (path can be relative to repo root or `apps/scraper/`). Alternatively try `SCRAPER_HEADED=1` or a remote browser with US egress.

### Competitive Cyclist

Production **listing ingest** is **not** a scraper scrape route: the API scheduler calls the **Impact Partner Product Catalog** (`internal/impact`) when `IMPACT_ACCOUNT_SID` and `IMPACT_AUTH_TOKEN` are set. Use `make impact-catalog-probe` from the repo root to list catalogs and inspect a sample **Items** response. Outbound **`affiliate_url`** uses `IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST` when set; otherwise the Impact catalog **`Url`** when applicable.

**PDP enrichment** for CC is supported via `POST /enrich` only (`competitivecyclist` enricher in `parsers/competitivecyclist.ts`, Backcountry-family Cheerio helpers). Uses **Playwright** (same AWS WAF handling as Backcountry PLP — not plain `fetch`). During enrich, JSON-LD **`hasVariant`** on the PDP is parsed and the API fans out **`product_group_key`** + **`variant_options`** to existing Impact catalog rows that share the same canonical **`product_url`** and matching **`store_sku`** (see `make backfill-cc-variants`). CC is **not** in API `StoreTypesWithEnrichers` (scheduled nightly enrich skips CC); use admin **Enrich**, bulk re-enrich, or backfill when WAF cookies are valid.

CC blocks unattended HTTP with **AWS WAF** (“Human Verification”). Headless Playwright from a datacenter IP will not get JSON-LD unless you reuse cookies from a real browser session. That session is stored in **`apps/scraper/cc-storage.json`** (gitignored — never commit).

#### Generate `cc-storage.json` locally

Pick one bootstrap method:

**Option A — Playwright codegen (recommended first time)**

From `apps/scraper`:

```bash
pnpm exec playwright codegen \
  --save-storage=cc-storage.json \
  "https://www.competitivecyclist.com/ion-rascal-amp-cycling-shoe-mens"
```

1. Chromium opens on a CC PDP.
2. Complete the **Human Verification** challenge if shown.
3. Confirm the product page loaded (not a blank/challenge page).
4. Close the codegen window — Playwright writes `apps/scraper/cc-storage.json`.

**Option B — Headed enrich + auto-save**

1. In repo root `.env`:
   ```bash
   SCRAPER_STORAGE_STATE=apps/scraper/cc-storage.json
   SCRAPER_HEADED=1
   ```
2. Start scraper + API; trigger one CC enrich (admin **Enrich** on a CC listing, or `make enrich-now-competitivecyclist` with `FORCE=1` for a small batch).
3. Solve WAF in the visible browser window once.
4. Confirm scraper logs show `variants_parsed=N` (N > 0 for multi-SKU products) and `saved storage state to .../cc-storage.json`.
5. Remove `SCRAPER_HEADED=1` for normal headless runs. Auto-save refreshes the file after each successful non-WAF PDP locally.

#### Local configuration

In repo root `.env`:

```bash
SCRAPER_STORAGE_STATE=apps/scraper/cc-storage.json
```

Paths can be relative to repo root or `apps/scraper/` (see `resolveScraperStorageState` in `src/config.ts`). On scraper startup you should see:

```text
[scraper] SCRAPER_STORAGE_STATE env="apps/scraper/cc-storage.json" resolved=... load=...
```

#### Verify enrich works

With scraper running, enrich one PDP and check logs:

```text
[scraper] competitivecyclist enrich debug: transport=playwright ... waf_suspect=false variants_parsed=9 sample_skus=...
```

API side (after enrich): `[cc-variants] fan-out done: ... matched=N`.

Manual curl (optional):

```bash
curl -X POST http://localhost:3000/enrich \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.competitivecyclist.com/ion-rascal-amp-cycling-shoe-mens","store":"competitivecyclist"}'
```

#### Production (Render)

1. Generate `cc-storage.json` locally (Option A or B above).
2. On the **scraper** service (not the API): add a **secret file** named `cc-storage.json` (contents of your local file).
3. Set env on the scraper service:
   ```bash
   SCRAPER_STORAGE_STATE=/etc/secrets/cc-storage.json
   ```
4. Redeploy the scraper. Startup logs must show `load=/etc/secrets/cc-storage.json` (not `file missing`).
5. Run `make backfill-cc-variants` against production (API + scraper up) or wait for nightly enrich.

Render secret files are often **read-only** — auto-save may log `failed to save storage state` in prod. When WAF starts failing again (`waf_suspect=true`), regenerate locally and re-upload the secret file.

#### When WAF still blocks

- Refresh `cc-storage.json` (cookies expire).
- Try `SCRAPER_HEADED=1` locally to re-seed, then re-upload to Render.
- Try `BROWSER_WS_ENDPOINT` with a remote browser that has US residential egress.
- Do **not** set `BROWSER_USER_AGENT` to `MTBDealBot` — it triggers WAF.

#### Debug logs

- Scraper: `[scraper] competitivecyclist enrich debug:` (`transport=playwright`, `html_bytes`, `waf_suspect`, `variants_parsed`, sample SKUs).
- API: `[cc-variants]` (variant count from enrich, fan-out `matched` / `skipped_sku` counts).

### Canyon

**Listing scrape** (`canyon` in `PARSERS`) uses **fetch + Cheerio** against the Demandware ajax grid (`Search-IncludeProductGrid` on `cgid=helper-sale-us`), paginated with `start` / `sz=24` — no Playwright. Seed `scrape_url`: `https://www.canyon.com/en-us/sale/`. Emits one row per color swatch when the PLP tile exposes `data-pdp-url`; `product_group_key` is the numeric master id from the PDP path (`…/3175.html`).

**PDP enrichment** (`enrichCanyon`) fetches PDP HTML and parses JSON-LD `Product` (description, `additionalProperty`) plus breadcrumb `BreadcrumbList` when present. No affiliate URL in MVP.

```bash
make scrape-now-canyon
make enrich-now-canyon
```

### Specialized

**Listing scrape** (`specialized` in `PARSERS`) uses **fetch** against persisted GraphQL `SEARCH_PRODUCT_DATA` (`/api/graphql/SEARCH_PRODUCT_DATA`, APQ hash in `specialized-plp.ts`), paginating `page` 1…`totalPages` with `resultsPerPage=96`. Requests include Apollo CSRF headers (`x-apollo-operation-name`, `apollo-require-preflight`). Seed `scrape_url`: `https://www.specialized.com/us/en/shop/sale`. Emits one row per `swatchesJSON` entry; `store_sku` is the swatch id (`{colorId}-{productId}`), `product_group_key` is the product id.

**PDP enrichment** (`enrichSpecialized`) fetches PDP HTML and parses microdata breadcrumbs, `og:description`, and technical-spec sections. No affiliate URL in MVP.

```bash
make scrape-now-specialized
make enrich-now-specialized
```

### Mack Cycle

**Listing scrape** (`mackcycle` in `PARSERS`) uses **fetch** against Shopify collection `products.json` on `/collections/sale` (`limit=250`, paginated). Emits one row per variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://www.mackcycle.com/collections/sale`.

**PDP enrichment** (`enrichMackCycle`) mirrors Worldwide Cyclery / Thunder Mountain: parallel `GET /products/{handle}.json` (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs). No affiliate URL in MVP.

```bash
make scrape-now-mackcycle
make enrich-now-mackcycle
```

### Ride Concepts

**Listing scrape** (`rideconcepts` in `PARSERS`) uses **fetch** against Shopify collection `products.json` on `/collections/on-sale` (`limit=250`, paginated). Emits one row per variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://rideconcepts.com/collections/on-sale`.

**PDP enrichment** (`enrichRideConcepts`) mirrors Mack Cycle / Thunder Mountain: parallel `GET /products/{handle}.json` (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs). No affiliate URL in MVP.

```bash
make scrape-now-rideconcepts
make enrich-now-rideconcepts
```

### Leatt

**Listing scrape** (`leatt` in `PARSERS`) uses **fetch** against Shopify collection `products.json` on `/collections/mtb-hot-deals` (`limit=250`, paginated). Emits one row per variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://us.leatt.com/collections/mtb-hot-deals`.

**PDP enrichment** (`enrichLeatt`) mirrors Mack Cycle / Thunder Mountain: parallel `GET /products/{handle}.json` (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs). No affiliate URL in MVP.

```bash
make scrape-now-leatt
make enrich-now-leatt
```

### The Gravity Cartel

**Listing scrape** (`gravitycartel` in `PARSERS`) uses **fetch** against Shopify collection `products.json` on `/collections/sale` (`limit=250`, paginated). **In-stock variants only** — the sale page lists many sold-out SKUs. Emits one row per available variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://thegravitycartel.com/collections/sale`.

**PDP enrichment** (`enrichGravityCartel`) mirrors Mack Cycle / Leatt: parallel `GET /products/{handle}.json` (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs). No affiliate URL in MVP.

```bash
make scrape-now-gravitycartel
make enrich-now-gravitycartel
```

### Bikes Online

**Listing scrape** (`bikesonline` in `PARSERS`) uses **fetch** against Shopify collection `products.json` on `/collections/sale` (`limit=250`, paginated). Filters package-protection add-ons from the sale feed. Emits one row per variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://www.bikesonline.com/collections/sale`.

**PDP enrichment** (`enrichBikesOnline`) mirrors Mack Cycle / Chromag: parallel `GET /products/{handle}.json` (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs). No affiliate URL in MVP.

```bash
make scrape-now-bikesonline
make enrich-now-bikesonline
```

### Evo

**Listing scrape** (`evo` in `PARSERS`) uses **Playwright** against Shopify collection `products.json` on `/collections/bike-sale` (`limit=250`, paginated). Cloudflare blocks plain HTTP fetch; the parser warms up a browser session on the collection page, then fetches JSON via in-page `fetch`. Emits one row per variant; `product_group_key` is the product handle; `variant_options` from `shopify-helpers`. Seed `scrape_url`: `https://www.evo.com/collections/bike-sale`.

**PDP enrichment** (`enrichEvo`) mirrors Mack Cycle / Chromag: parallel product JSON (specs from `body_html` tables/dl) and PDP HTML (breadcrumbs), fetched through the same browser session.

```bash
make scrape-now-evo
make enrich-now-evo
```

### Trek

**Listing scrape** (`trek` in `PARSERS`) uses **fetch** against SAP Commerce OCC (`api.trekbikes.com/occ/v2/us/categories/B300/products?query=:relevance:saleFlag:true`), paginated with `currentPage` / `pageSize=24`. In parallel, fetches the seed PLP HTML and parses Vue `:product` blocks for `wasPriceRange` (MSRP). Emits one row per product code; `store_sku` and `product_group_key` are the OCC `code`. Seed `scrape_url`: MTB category B300 with `saleFlag:true`.

**PDP enrichment** (`enrichTrek`) fetches PDP HTML (follow redirects) and parses `#breadcrumbs` plus `og:description`. Technical specs are client-rendered on Trek PDPs; `raw_specs` is typically null until a Playwright follow-up. No affiliate URL in MVP.

```bash
make scrape-now-trek
make enrich-now-trek
```

### Universal Cycles

**Listing scrape** (`universalcycles` in `PARSERS`) uses **fetch + Cheerio** against `specials.php`, paginated with `?resultpage=2` … `N` (not `page=`). Parses `.product-box` tiles; `store_sku` is the product `id` from `product_details.php?id=`. Prefers **Overstock Item From:** over **From:** for `current_price`; optional **MSRP:** for `original_price`. Section headers (`h4.well`) seed `category_path`. Seed `scrape_url`: `https://www.universalcycles.com/specials.php`.

**PDP enrichment** (`enrichUniversalCycles`) fetches PDP HTML and parses `#attribute_{id}` blocks into `variants[]` (composite SKU, dimensions label, per-variant prices, `is_orderable` from Add to Cart vs Notify/Out of Stock). Description and bullet specs come from `#PageContent`. The API fans out attribute rows via `ApplyUniversalCyclesVariantFanout` and hides the parent product-id row; migration `026` backfills hidden parents when siblings exist.

```bash
make scrape-now-universalcycles
make enrich-now-universalcycles
```

### N+1 Bikes

**Listing scrape** (`n1bikes` in `PARSERS`) uses the public **MasterLinq** catalog API (`POST …/api/ecom/catalog/search` with header `x-account-code: LKY`), paginated with `continuationToken`. The seed URL `?discount=0.2` maps to `discountAtOrAbove: 0.2`. Emits one row per on-sale variant where `map < msrp`; **online stock** uses summed supplier inventory in `totalInventoryByProduct` (not retail-only “In Stock” badges).

**PDP enrichment** (`enrichN1Bikes`) fetches product HTML and parses embedded `specifications` JSON plus `og:description`.

```bash
make scrape-now-n1bikes
make enrich-now-n1bikes
```

### Fox Racing

**Listing scrape** (`foxracing` in `PARSERS`) uses **fetch + Cheerio** against the Demandware ajax grid (`Search-UpdateGrid` on `cgid=sale-mtb`), paginated with `start` / `sz=60`. Parses `div.product[data-pid]` tiles; `store_sku` is the variant id (e.g. `VG-31930-001`); `product_group_key` is the base style id (`VG-31930`). Category hints come from GTM `item_category*` JSON on each tile.

**PDP enrichment** (`enrichFoxRacing`) fetches product HTML and parses microdata breadcrumbs plus accordion sections (Description, Key Features, Specifications, Materials & Care). Color swatches on the PDP populate `variants[]`; the API fans out `Color` labels and per-color stock to sibling rows sharing the same `product_group_key` (base style id, e.g. `VG-29354`). Selectable sizes for the viewed color are stored in `raw_specs["Available sizes"]`.

```bash
make scrape-now-foxracing
make enrich-now-foxracing
```

## Endpoints

| Endpoint  | Method | Purpose                                           |
| --------- | ------ | ------------------------------------------------- |
| `/scrape` | POST   | Scrape sale page; returns `ScrapeResult[]`        |
| `/enrich` | POST   | Visit PDP URL; returns specs, category_path, etc. |
| `/health` | GET    | Health check (no auth)                            |

### Error monitoring (Sentry)

When `SENTRY_DSN` is set (production should set it), new routes that can fail with 5xx must report via `captureRouteError` or `next(err)` + `setupExpressErrorHandler`—not only stdout logs. Policy: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

### Logging

Structured JSON via `@mtb-aggregator/logging` (`src/logging.ts`, `src/server.ts`). Env: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_HTTP_ACCESS`. Full schema: [docs/LOGGING.md](../../docs/LOGGING.md).

### Docker (Render)

The scraper image is built from [`Dockerfile`](Dockerfile). Workspace deps copied into the image include `packages/logging` (shared logger) and `packages/shared`. The image runs `pnpm --filter @mtb-aggregator/logging run build` before compiling the scraper so production `node dist/server.js` resolves compiled JS from `@mtb-aggregator/logging`.

## Parser Structure

Parsers live in `src/parsers/` — one file per store:

- `jensonusa.ts` — JensonUSA sale + enrichment
- `worldwidecyclery.ts` — Worldwide Cyclery
- `revelbikes.ts` — Revel Bikes (Shopify collection JSON + PDP enrich via `/products/{handle}.json`; specs from `body_html` `<strong>KEY:</strong><br>value` paragraphs)
- `backcountry.ts` — Backcountry (Backcountry-family React PLP; shared logic in `backcountry-family-plp.ts`)
- `competitivecyclist.ts` — Competitive Cyclist (**enrich only**; ingest is Impact catalog on the API)
- `ridebicycles.ts` — Ride Bicycles (Shopify JSON API; browser-like fetch + paced pagination; in-stock + ≥15% off compare-at)
- `thundermountainbikes.ts` — Thunder Mountain Bikes (Shopify collection JSON + PDP enrich like Worldwide Cyclery)
- `mackcycle.ts` — Mack Cycle (Shopify collection JSON + PDP enrich like Worldwide Cyclery)
- `rideconcepts.ts` — Ride Concepts (Shopify collection JSON + PDP enrich like Mack Cycle)
- `leatt.ts` — Leatt (Shopify collection JSON + PDP enrich like Mack Cycle)
- `chromag.ts` — Chromag (Shopify collection JSON + PDP enrich like Mack Cycle)
- `gravitycartel.ts` — The Gravity Cartel (Shopify collection JSON + PDP enrich; **in-stock variants only**)
- `bikesonline.ts` — Bikes Online (Shopify collection JSON + PDP enrich like Mack Cycle)
- `evo.ts` — Evo (Shopify collection JSON via Playwright + PDP enrich; Cloudflare-protected)
- `canyon.ts` / `canyon-plp.ts` / `canyon-pdp.ts` — Canyon US sale (Demandware ajax PLP + fetch PDP enrich)
- `specialized.ts` / `specialized-plp.ts` / `specialized-pdp.ts` — Specialized US sale (GraphQL PLP + fetch PDP enrich)
- `trek.ts` / `trek-plp.ts` / `trek-pdp.ts` — Trek US MTB sale (OCC PLP + HTML MSRP merge + fetch PDP enrich)
- `universalcycles.ts` / `universalcycles-plp.ts` / `universalcycles-pdp.ts` — Universal Cycles specials (fetch PLP + attribute fan-out on PDP enrich)
- `n1bikes.ts` / `n1bikes-plp.ts` / `n1bikes-pdp.ts` — N+1 Bikes sale catalog (MasterLinq API + PDP specs enrich)
- `foxracing.ts` / `foxracing-plp.ts` / `foxracing-pdp.ts` — Fox Racing MTB legacy drops (Demandware ajax PLP + fetch PDP enrich)

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

Shopify parsers (`ridebicycles`, `worldwidecyclery`, `revelbikes`, `thundermountainbikes`, `mackcycle`, `rideconcepts`, `leatt`, `chromag`, `gravitycartel`, `bikesonline`, `evo`) emit one row per variant; the API stores `product_group_key` as `{store_id}:{handle}` and `variant_options` as JSON for deduplication and filters. Shared helpers: `parsers/shopify-helpers.ts`. Evo uses Playwright for JSON/HTML because Cloudflare blocks plain fetch.

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

### HTML/JSON fixtures

Fixtures under `src/parsers/__fixtures__/` must be **gitleaks-safe** before commit. Demandware PDP captures often include `yotpoAppKey`; replace any real value with `fixture-yotpo-app-key-not-real` (see `bell/pdp-avenue-mips.html` and `foxracing/pdp-*.html`). CI secret scanning runs on the **full PR commit range** — sanitizing in a follow-up commit is not enough if an earlier commit added the live key. The fixtures path is allowlisted in [`.gitleaks.toml`](../../.gitleaks.toml) for placeholder false positives, but sanitize before the first push. Details: [docs/SCRAPING.md](../../docs/SCRAPING.md#test-fixtures-and-ci-gitleaks).

## Manual Test (API + scraper running)

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.jensonusa.com/clearance", "store": "jensonusa"}'
```
