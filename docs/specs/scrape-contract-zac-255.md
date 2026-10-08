# Spec: Scrape contract across store types (ZAC-255)

Parent: [ZAC-161](https://linear.app/zacks-personal-projects/issue/ZAC-161/normalize-scraping-enrichment-variants-across-store) (normalize scraping / enrichment / variants).

Sibling specs:

- [ZAC-256 OOS policy](../ideas/oos-policy-zac-256.md) — when scrape may write `is_in_stock`; keep OOS rows; restock SLA.
- [ZAC-254 variant identity](variant-identity-zac-254.md) — SKU / option keys, parent–child linking (identity rules; this spec only defines scrape-time emission).
- [ZAC-253 enrichment](enrichment-normalization-zac-253.md) — PDP / LLM after scrape.
- [ZAC-211](https://linear.app/zacks-personal-projects/issue/ZAC-211/are-we-scraping-and-saving-description-specs-etc) — whether scrape should persist description / specs (out of scope here except `feed_description`).

Operational store notes stay in [docs/SCRAPING.md](../SCRAPING.md) and [apps/scraper/README.md](../../apps/scraper/README.md). This file is the **shared contract**: what every ingest path must emit, how pagination completeness is signaled, how variants are discovered at scrape time, how errors propagate, and what “done” means for a new store.

## Objective

How might we add or change a store scrape so the API always receives the same listing shape, can tell a **full** sale catalog from a **truncated** one, and does not invent a new variant or stock story per retailer?

**Users**

- **Agent / engineer adding a store:** a checklist instead of copying an adjacent parser and hoping upsert + `HideStaleListings` behave.
- **Scheduler ingest:** one `ScrapeResult` DTO whether the source is Node `POST /scrape` or the Impact catalog (Competitive Cyclist).
- **Rider:** `/deals` only shows in-stock, non-hidden rows; leftover SKUs from a thin scrape must not vanish.

**Success:** A new store can be reviewed against this document. Gaps below are explicit; they are not silently “how Shopify works.”

## Tech stack

Unchanged: Node scraper (`apps/scraper`, Zod `ScrapeResultSchema`), Go scheduler (`apps/api/internal/scheduler` + `internal/scraper` + `internal/impact`), Postgres `store_listings` upsert (`internal/db/listings_upsert.go`).

No new runtime dependencies for this spec.

## Commands

```bash
# Scraper contract (Zod + parser tests)
pnpm --filter @mtb-aggregator/scraper run test

# API ingest / validation / stale-hide
cd apps/api && go test ./internal/scraper/... ./internal/scheduler/... ./internal/impact/... ./internal/db/...
cd apps/api && go vet ./...

# Manual scrape (scraper + API running)
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://worldwidecyclery.com/collections/deals","store":"worldwidecyclery"}'
curl -X POST 'http://localhost:8080/scrape-now?store=worldwidecyclery'
```

## Project structure

```
apps/scraper/src/types.ts                 # ScrapeResultSchema, STORE_TYPES
apps/scraper/src/server.ts                # POST /scrape, X-Scrape-Truncated
apps/scraper/src/parsers/index.ts         # PARSERS / ENRICHERS
apps/scraper/src/parsers/shopify-helpers.ts
apps/scraper/src/parsers/jensonusa-pagination.ts  # only Jenson stamps truncated today
apps/api/internal/scraper/client.go       # Go ScrapeResult + header
apps/api/internal/scraper/validate.go     # ingest-boundary validation
apps/api/internal/scheduler/scheduler.go  # fetch → validate → upsert → HideStale
apps/api/internal/impact/map_catalog_item.go
apps/api/internal/db/listings_upsert.go
docs/specs/scrape-contract-zac-255.md     # this file
```

## Locked decisions

Correct these before implementation PRs treat them as optional.

1. **One row per purchasable SKU when the sale source already enumerates SKUs.** Shopify `products.json`, Jenson clearance `variants[]`, Impact catalog items, N+1 catalog variants, ION article variants. Do not collapse to a parent “from $X” tile if the PLP/catalog already has per-SKU prices.
2. **Parent-then-fan-out is allowed only when the PLP cannot enumerate SKUs.** Universal Cycles (`specials.php` parent id), Trek OCC product code, Specialized / Demandware color tiles. Document the fan-out owner (PDP enricher + API `Apply*VariantFanout`). Scrape still emits a stable `store_sku` for the tile that exists.
3. **`store_sku` is unique per `(store_id, store_sku)`.** Dedup inside the parser. Prefer the retailer’s SKU; fall back to a stable synthetic (`v{shopifyVariantId}`, `{masterId}-{colorCode}`). Never reuse a parent SKU for a child after fan-out (Jenson / UC hide superseded parents).
4. **`product_group_key` is the store-local family id.** Parser sends handle / parent code / master id / article number. API stores `{store_id}:{key}`. Competitive Cyclist sends the PDP slug. Omit only when there is no family (a true single SKU).
5. **Sale-page presence ≠ stock.** `HideStaleListings` means “left this scrape’s sale set.” Stock is `is_in_stock` + (planned) `stock_from_plp` per ZAC-256.
6. **A scrape that did not finish the catalog must not look complete.** Set `X-Scrape-Truncated: 1` so the API skips stale-hide. Thin vs the store’s 14-day max upserted (ZAC-270) is a second, ingest-side guard — parsers must not rely on it.
7. **Fail the job on transport / parse collapse; drop only per-row contract violations.** HTTP 4xx/5xx from the store, WAF challenge with no products, empty JSON after a successful status — throw. A bad `current_price` on one tile — skip that row, return 200 with the rest.
8. **Competitive Cyclist listing ingest is Impact, not `POST /scrape`.** Same `ScrapeResult` shape. Node `PARSERS` has no `competitivecyclist` key.

## Store families

Every store maps to one family. New stores should pick a family and reuse its helpers before inventing a sixth pagination style.

| Family | How scrape runs | Typical stores | Variant grain at scrape | Stock signal on PLP |
| --- | --- | --- | --- | --- |
| **Shopify collection JSON** | `GET {collection}/products.json?limit=250&page=N` | Worldwide Cyclery, Revel, Thunder Mountain, Mack, Ride Concepts, Leatt, Chromag, Bikes Online, Evo, Cambria, 365, Lost Co, Hayes, Race Face, Colorado Cyclist, Canfield, Cased, Gravity Cartel | One row per `variant` | `variant.available` (ZAC-256: `stock_from_plp=true`) |
| **SmartEtailing HTML** | `GET /product-list/…/?rb_onSale=1&maxItems=60`, follow Next page | Ride Bicycles (in-stock bikes + in-stock cycling equipment) | One row per product card (`se{id}`) | None — in-stock sale lists only (`true`) |
| **JensonUSA DTO** | Playwright `/sale`, `data-product-result-dto` | `jensonusa` | One row per DTO `variants[]` | None — always `true` today |
| **Backcountry-family PLP** | Playwright + embedded / captured JSON | `backcountry` | One row per extracted SKU | `isInStock` when present |
| **Demandware ajax grid** | `Search-UpdateGrid` / `Search-IncludeProductGrid` | Canyon, Fox Racing, Bell, Giro | One row per **color tile** (`data-pid`) | Canyon: `!limitedStock` (“Only available in”). Fox/Bell/Giro: none (`true`) |
| **Specialized RPC** | `searchProducts` + HTML token | `specialized` | One row per color swatch | None (`true`) |
| **Trek OCC** | SAP Commerce `categories/B300/products` | `trek` | One row per OCC `code` | None (`true`) |
| **Universal Cycles HTML** | `specials.php?resultpage=N` | `universalcycles` | One **parent** row per product id | None (`true`); sizes on PDP fan-out |
| **N+1 MasterLinq** | `POST …/catalog/search` + `continuationToken` | `n1bikes` | One row per discounted variant | Supplier warehouse qty |
| **ION hybrid** | Nuxt article API + Shopify Storefront GraphQL | `ion` | Discounted variants; group = article number | Regional / GraphQL availability |
| **Impact catalog** | Go `internal/impact` (not Node `/scrape`) | `competitivecyclist` | One row per catalog item | `StockAvailability` / similar (empty → in-stock today) |

**Shopify transport extras (not a different contract):** browser-like UA + Referer + page delay + retry 403/429/503 (Cambria, 365, Lost Co, Hayes, Race Face, Colorado, Canfield, Cased). Evo uses Playwright to establish a session before `products.json`. Ride Bicycles uses the same fetch pacing on SmartEtailing HTML and keeps cards at **15–75%** off (range prices must match the card’s “N% Off” badge). Those filters are **sale predicates**, not schema exceptions.

## Field contract (`ScrapeResult`)

Shared TypeScript (`apps/scraper/src/types.ts`) and Go (`apps/api/internal/scraper/client.go`). Zod is the Node wire schema; Go `ValidateResult` is the ingest gate (invalid rows skipped, not 500).

| Field | Required | Rules | Ingest notes |
| --- | --- | --- | --- |
| `store_sku` | **Yes** | Non-empty; unique within the batch | Unique with `store_id` |
| `product_name` | **Yes** | Non-empty | Written on every upsert |
| `current_price` | **Yes** | `> 0`. Go also rejects `> 50000` as a parse bug | Skip row if drop vs last scrape `> 90%` |
| `original_price` | Nullable | If set, `> 0`. Go warns / errors if discount `> 80%` (bulk compare-at) | Sale pages should have it on **most** rows; batch warning if `< 10%` of ≥10 results have it (`SCRAPER_STRICT_ORIGINAL_PRICE=1` aborts save) |
| `product_url` | **Yes** | Absolute `http(s)` PDP URL | Canonical PDP (Impact unwraps tracking hops) |
| `image_url` | Nullable | If set, valid URL | |
| `brand` | Nullable | Raw vendor string | API `brand.Normalize` |
| `category_path` | Nullable | Short shoppable labels only (`isPlausibleCategoryLabel`: not marketing sentences) | Taxonomy map + `category_id`; empty path does not wipe an existing path |
| `is_in_stock` | **Yes** | Boolean | **Today** upsert always overwrites. **ZAC-256:** overwrite only when `stock_from_plp` |
| `stock_from_plp` | Planned | `true` = PLP/catalog stock is authoritative | Not in Zod/Go yet — see [ZAC-256](../ideas/oos-policy-zac-256.md) |
| `product_group_key` | Should set when a family exists | Store-local id (handle, parent code, master id) | Stored as `{store_id}:{key}`; `COALESCE` on conflict (new value wins if non-null) |
| `variant_options` | Should set when dimensions exist | `Record<string, string>` with **canonical** keys (`Size`, `Color`, …) per [ZAC-254](variant-identity-zac-254.md) | `COALESCE`/merge on conflict; feeds `bike_size` / `clothing_size` |
| `feed_description` | Impact only | Catalog description | Merged into `metadata.description` for LLM without PDP |
| `impact_catalog_outbound_url` | Impact only | Tracking hop when deep-link template unset | `affiliate_url` |

**Not scrape fields:** `description` / `raw_specs` / `canonical_category` / `affiliate_url` (except CC). Those are enrich or scheduler-derived. Do not invent scrape-time HTML spec tables for Shopify just to satisfy ZAC-211 — that is the enrichment spec.

### Code style (emission)

```ts
results.push({
  store_sku: variant.sku?.trim() || `v${variant.id}`,
  product_name: product.title,
  current_price: currentPrice,
  original_price: compareAt && compareAt > currentPrice ? compareAt : null,
  product_url: `${origin}/products/${product.handle}`,
  image_url: variant.featured_image?.src ?? product.images?.[0]?.src ?? null,
  brand: product.vendor || null,
  category_path: product.product_type ? [product.product_type] : null,
  is_in_stock: variant.available,
  // stock_from_plp: true, // ZAC-256 — Shopify available
  product_group_key: product.handle,
  ...(variantOpts ? { variant_options: variantOpts } : {}),
});
```

Dedup by `store_sku` before return. `SCRAPER_MAX_PRODUCTS > 0` is a **dev cap**; treat it as truncated if it stops a live catalog (gap today).

## Pagination and “complete”

A scrape is **complete** when the parser walked the sale source to a natural end:

| Family | Natural end | Hard cap today | Truncation signal today |
| --- | --- | --- | --- |
| Shopify | Empty page or `products.length < 250` | None (page loop) | **None** |
| Jenson | Last page `< 48` listings or no next URL | `JENSON_MAX_PAGES` (default 50; ignores a lower `SCRAPER_MAX_PAGES`) | **Yes** — `markJensonScrapeTruncated` → `X-Scrape-Truncated: 1` (cap on a full page, or empty page after a full page / WAF miss) |
| SmartEtailing (Ride Bicycles) | No “Next page” link | `RIDEBICYCLES_MAX_PAGES` (default 20) | **Yes** — same truncated stamp when the cap or `SCRAPER_MAX_PRODUCTS` stops the walk |
| Backcountry | Empty extract | `SCRAPER_MAX_PAGES` default **5** | **None** (cap can silently look complete) |
| Demandware / Canyon | Empty grid page | None | **None** |
| Specialized / Trek | `page > totalPages` or empty add | None | **None** |
| UC | `resultpage` through parsed max | None | **None** |
| N+1 | No `continuationToken` | `MAX_CATALOG_PAGES = 100` | **None** if the cap hits |
| Impact | Catalog pager exhausted | Client page size env | N/A (Go path; no header) |

**Contract (target):**

1. If the parser **knows** it stopped early (page cap, empty-after-full, token remaining), it **must** set truncated. Node: stamp the result array (generalize Jenson’s symbol) so `POST /scrape` sets `X-Scrape-Truncated: 1`. Impact: pass `truncated` into the same scheduler branch.
2. `SCRAPER_MAX_PRODUCTS` in production (`> 0`) is truncated.
3. Scheduler (`shouldHideStaleAfterScrape`): skip `HideStaleListings` when `truncated`, or `validCount < 10`, or thin (`validCount < recentMax/2` with `recentMax ≥ 10`). First successful scrape (`recentMax = 0`) **may** hide — do not ship a parser that returns 3 of 200 SKUs without truncated.
4. Truncated / thin scrapes still **upsert** (`hidden = false`) and still re-hide Jenson/UC superseded parents.

## Variant discovery

Scrape-time job: emit rows the deals UI can group (`GET /deals?group_variants=true`) without waiting for PDP.

| Pattern | When to use | `store_sku` | `product_group_key` | `variant_options` | Follow-up |
| --- | --- | --- | --- | --- | --- |
| **PLP-complete** | Catalog lists every buyable SKU | Variant SKU | Product handle / parent id | All option axes from the same payload | PDP only for specs / breadcrumbs |
| **PLP-partial** | Card has variants but incomplete axes (Jenson Color-only) | Variant code | Parent code | Card facets, plus Size inferred from the code suffix when missing | PDP `variants[]` + API fan-out (stock + missing Size). Scrape upsert merges option maps so Color-only PLP cannot wipe Size |
| **Tile-then-fan-out** | Grid is color (or parent) only | Tile pid / `{master}-{color}` / parent id | Master / style / product id | Color if known | PDP `variants[]` + `Apply*VariantFanout`; hide superseded parent if children appear |
| **Catalog-flat** | Impact SKUs | Catalog item id | PDP slug from the shared `product_url` (CC, ZAC-294) | `Size` / `Color` parsed from the catalog title; PDP `hasVariant` can still refine | Next CC scrape keeps the group. `backfill-cc-variants` remains the WAF path |

**Do:**

- Emit OOS variants when the source has a real availability flag (ZAC-256). Gravity Cartel must stop `if (!variant.available) continue`. Ride Bicycles’ SmartEtailing sale lists do not include OOS cards.
- Keep OOS rows. Public `/deals` already filters `is_in_stock=true AND hidden=false`.
- Dedup SKUs. Prefer the first complete row.

**Do not:**

- Use `HideStaleListings` as OOS.
- Emit a second row with the parent SKU after children exist (Jenson / UC migrations `025` / `026`).
- Put sentence-length collection H1s in `category_path` (ZAC-234).

Identity collisions (same SKU, different option maps; handle vs numeric id) belong in **[ZAC-254](variant-identity-zac-254.md)**. This spec only requires: one SKU → one row per scrape; family key stable across scrapes. Canonical `Size` / `Color` keys and parent-hide rules are locked there.

## Error handling

```
POST /scrape
  400  bad body / unknown store (not in STORE_TYPES / PARSERS)
  401  secret mismatch when SCRAPER_SERVICE_SECRET set
  200  JSON array (possibly empty) + optional X-Scrape-Truncated: 1
  500  parser threw (Sentry captureRouteError + logs/scrape-error-*.txt)
```

| Failure | Parser / client | Scheduler |
| --- | --- | --- |
| Store HTTP 4xx/5xx after retries | **Throw** | Job `failed`; no HideStale |
| WAF / challenge HTML, zero products | **Throw** (do not return `[]`) | Same |
| One tile missing price / SKU | Skip row; Zod + `ValidateResult` | Counted in validation errors; rest upsert |
| Implausible discount (`> 80%`) | Prefer skip in parser (Ride Bicycles cap) | Go `ValidateResult` drops the row |
| Batch `< 10%` original_price (≥10 rows) | — | Warning; abort only if `SCRAPER_STRICT_ORIGINAL_PRICE=1` |
| Price drop `> 90%` vs last upsert | — | Skip that SKU (shadow check) |
| Ingest timeout | — | `timed_out`, partial upserts, **no** HideStale |
| Truncated or thin | Header / stamp | Warn + Sentry warning; skip HideStale |

Empty `[]` with HTTP 200 is only valid when the sale catalog is actually empty. A blocked PLP that looks empty is a **500**.

## Ingest merge (API, part of the contract)

On `ON CONFLICT (store_id, store_sku)`:

- Always refresh name, prices, URLs, image, brand, `last_scraped`, `hidden = false`.
- `category_path`: keep existing if incoming is null/empty.
- `canonical_category` / `category_id`: keep existing when already set.
- `metadata`: merge description / specs / llm size fields; do not wipe LLM output.
- `is_in_stock`: **today always incoming**; ZAC-256 gates on `stock_from_plp`.
- `product_group_key` / `variant_options`: incoming if non-null, else keep.

After a **complete** ingest: hide rows whose `last_scraped` predates the run start; then re-hide Jenson/UC superseded parents (upsert unhides them).

## What “done” means for a new store

A store is done when all of the following are true. Registration-only (parser file + seed row) is **not** done.

### 1. Family + registration

- [ ] Chosen family from the table above (or a short ADR in the PR if none fit).
- [ ] `scrape{Store}(url): Promise<ScrapeResult[]>` in `parsers/{store}.ts` (split `-plp.ts` when the grid is large).
- [ ] `STORE_TYPES` + `PARSERS` (and `ENRICHERS` + `StoreTypesWithEnrichers` if PDP exists).
- [ ] `stores` row: `store_type` matches the map key; `scrape_url` is the sale collection the parser actually pages.
- [ ] `make scrape-now-{store}` (and enrich target if applicable).
- [ ] Docs: one paragraph in [docs/SCRAPING.md](../SCRAPING.md) + [apps/scraper/README.md](../../apps/scraper/README.md).

**Exception:** catalog-only ingest (CC) — no Node parser; document the Go client and env vars instead.

### 2. Row contract

- [ ] Every emitted row passes `ScrapeResultSchema` and `ValidateResult`.
- [ ] `store_sku` stable across scrapes (not “whatever the tile index is”).
- [ ] `product_group_key` + `variant_options` set whenever the source has a family / axes.
- [ ] `stock_from_plp` set per ZAC-256 classification (after that field exists). Until then, comment the class in the parser.
- [ ] OOS SKUs emitted when the source has a flag — not omitted.
- [ ] Gift cards / warranty add-ons filtered in the parser, not by taxonomy.

### 3. Pagination completeness

- [ ] Loop ends on a **natural** end, or sets truncated.
- [ ] Hitting an env page cap, empty-after-full, or `SCRAPER_MAX_PRODUCTS` in a real run sets truncated.
- [ ] First production scrape volume is in the same ballpark as a manual count of the sale PLP (spot-check 1 page × page count).

### 4. Variants

- [ ] Grain documented in the store README blurb (PLP-complete / PLP-partial / tile-then-fan-out).
- [ ] If fan-out: enricher returns `variants[]`; API applies a named `Apply{Store}PDPVariantFanout`; superseded parents hidden (migration or scheduler hook).
- [ ] `group_variants=true` collapses siblings on a sample product.

### 5. Tests and fixtures

- [ ] Vitest: at least one fixture page/JSON → expected SKU, prices, group key, options, stock.
- [ ] OOS / unavailable fixture if the family has a flag.
- [ ] Pagination unit tests if the store has a cap or next-page URL helper.
- [ ] Fixtures sanitized (no live `yotpoAppKey` / widget secrets). See [docs/SCRAPING.md](../SCRAPING.md#test-fixtures-and-ci-gitleaks).

### 6. Manual verify (API + scraper)

- [ ] `POST /scrape` returns rows; no 500.
- [ ] `POST /scrape-now?store=` upserts; admin / `GET /deals?store=` shows them.
- [ ] A second scrape does not duplicate SKUs.
- [ ] Removing a SKU from a **full** scrape hides it; a **truncated** scrape does not hide the rest of the catalog.

### 7. Out of scope for “scrape done”

PDP breadcrumbs, LLM classify/extract, affiliate networks, and WAF cookie rotation are **enrich / ops**. A store can ship scrape-only (CC listings) if the family says so. A store in `StoreTypesWithEnrichers` is not “scrape done” until the enricher exists — but that bar is [ZAC-253](enrichment-normalization-zac-253.md), not this file.

## Code gaps vs current scrapers

Honest delta against the contract above. Implementation is **not** this ticket unless called out as a child.

| Gap | Where | Risk | Owner |
| --- | --- | --- | --- |
| `stock_from_plp` missing on Zod + Go `ScrapeResult` | `types.ts`, `client.go` | No-signal scrapes overwrite OOS → false `/deals` + re-PDP | ZAC-256 |
| Upsert always `is_in_stock = EXCLUDED` | `listings_upsert.go` | Same | ZAC-256 |
| Gravity Cartel `continue` on `!available` | `gravitycartel.ts` | HideStale treats OOS as “left /sale”; restock requires reappear | ZAC-256 |
| `X-Scrape-Truncated` only when a parser stamps the result array | `server.ts` `isScrapeTruncated` (Jenson, Ride Bicycles) | Other caps look complete | Follow-up (this contract) |
| Backcountry `SCRAPER_MAX_PAGES` default **5**, no truncated | `backcountry-family-plp.ts` | Off-page sale SKUs hidden | Follow-up |
| N+1 `MAX_CATALOG_PAGES = 100`, no truncated | `n1bikes-plp.ts` | Same if catalog grows | Follow-up |
| `SCRAPER_MAX_PRODUCTS` early `return` never stamps truncated | Most parsers | Local/prod misconfig can HideStale the catalog | Follow-up |
| Dual validation (Zod vs `ValidateResult`) | `server.ts` vs `validate.go` | Node allows `current_price` > 50k; Go drops it. Node requires `url()`; Go only `url.Parse` | Follow-up (align messages; keep both layers) |
| Shopify parsers copy-pasted (~20 files) | `parsers/*.ts` | Drift (UA, retry, OOS skip, sale %) | Follow-up / ZAC-161 normalize — optional shared `scrapeShopifyCollection` |
| Cursor rule still says “Use Playwright” | `.cursor/rules/scraper-parsers.mdc` | Agents launch Chromium for JSON stores | This PR (doc) |
| CC scrape groups on PDP slug | `impact/cc_variants.go` | Title parse can miss a creative color until siblings share a prefix | ZAC-294 |
| Description / specs not on Node scrape | All `PARSERS` | ZAC-211; scrape stays listing-only | [ZAC-253](enrichment-normalization-zac-253.md) / ZAC-211 |
| Specialized / Trek / Fox / Bell / Giro / Canyon: color or product grain, not size | `*-plp.ts` | Size chips wait on PDP or never appear | ZAC-254 |
| Worldwide Cyclery emits variants with **null** `original_price` | `worldwidecyclery.ts` | Fine if the deals collection is already sale-only; batch warning if not | Store-specific; no change required |
| Invalid rows dropped twice (Zod then Go) with only logs | `server.ts`, `ingestScrapeResults` | Silent loss; job still `completed` | Acceptable; keep validation errors on the job |

## Follow-up implementation (not this ticket)

This ticket ships the spec. Suggested children when implementing the contract (do not duplicate ZAC-256 tasks):

- **Task A — Shared truncation stamp**  
  Generalize `markJensonScrapeTruncated` → `markScrapeTruncated` / `isScrapeTruncated`. Stamp Backcountry on page cap, N+1 on token leftover, any parser that hits `SCRAPER_MAX_PRODUCTS`.  
  Verify: scraper tests + `go test ./internal/scraper ./internal/scheduler`.

- **Task B — Shared Shopify collection scraper** (optional)  
  One helper for fetch/page/retry/`buildVariantOptions`/OOS emit. Store files become URL + sale predicate + enrich.  
  Verify: existing Shopify vitest files still pass.

## Testing strategy

- **Scraper (vitest):** schema fixtures; one happy path per family already in-repo; new stores add a fixture as in “done” §5.
- **API (`go test`):** `ValidateResult` / `ValidateBatch`; `shouldHideStaleAfterScrape` (truncated / thin / first scrape); Impact mapper.
- **No browser** required for this spec.

## Boundaries

- **Always:** Emit the field contract; throw on transport collapse; stamp truncated when incomplete; document variant grain; sanitize fixtures.
- **Ask first:** New store family; changing `HideStale` thresholds; collecting PDP HTML on scrape (ZAC-211).
- **Never:** Return `[]` for a WAF block; skip OOS SKUs when `available` exists (after ZAC-256); use stale-hide as stock; commit live widget API keys.

## Success criteria (this ticket)

- [x] Spec covers required fields, pagination completeness, variant discovery, error handling, and a new-store “done” checklist.
- [x] Spec lists concrete gaps vs current parsers (not “scrapers vary”).
- [x] `stock_from_plp` is cited, not re-litigated (ZAC-256 owns the field).
- [x] Existing docs (`SCRAPING.md`, scraper README, ARCHITECTURE, CLAUDE.md, API/shared READMEs) point here.
- [x] Linear ZAC-255 links this file (draft PR #281).

## Open questions

None blocking the spec. Implementation order: ZAC-256 field + Gravity/Ride emit, then Task A (truncation), then optional Shopify helper. [ZAC-254](variant-identity-zac-254.md) locks `store_sku` / group-key / canonical option keys; identity follow-ups (Tasks A–E there) are separate from scrape truncation.
