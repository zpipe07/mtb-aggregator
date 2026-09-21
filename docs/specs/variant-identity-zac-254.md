# Spec: Variant identity across stores (ZAC-254)

Parent: [ZAC-161](https://linear.app/zacks-personal-projects/issue/ZAC-161/normalize-scraping-enrichment-variants-across-store) (normalize scraping / enrichment / variants).

Sibling specs:

- [ZAC-255 scrape contract](scrape-contract-zac-255.md) — what every ingest path must emit; this spec owns **which SKU / family / option keys** those fields carry.
- [ZAC-256 OOS policy](../ideas/oos-policy-zac-256.md) — when scrape may write `is_in_stock`; keep OOS rows. Identity still requires a stable SKU for an OOS sibling.
- [ZAC-253 enrichment](enrichment-normalization-zac-253.md) — PDP / LLM after scrape (fan-out *implementation* lives there; identity rules for children live here).
- [ZAC-248](https://linear.app/zacks-personal-projects/issue/ZAC-248/clothing-sizes-using-comma-separated-list) — shipped: leftover size **charts** in `llm_specs.clothing_size` split into facet values. This spec still forbids storing a chart as the row’s `variant_options.Size`.

Operational store notes stay in [docs/SCRAPING.md](../SCRAPING.md) and [apps/scraper/README.md](../../apps/scraper/README.md). This file is the **identity contract**: how a listing row is keyed, how siblings group, how size/color axes are named, and how parent tiles relate to child SKUs so the same product does not fragment or collide **inside one store**.

## Objective

How might we give every store the same variant identity so `/deals?group_variants=true` shows one card per product, size/color chips match purchasable SKUs, and a scrape cannot overwrite or duplicate a sibling?

**Users**

- **Rider:** one card per product at a retailer; in-stock Size/Color chips; no “same jersey twice.”
- **Agent / engineer adding a store:** pick a grain + key recipe instead of copying an adjacent parser’s SKU scheme.
- **Ingest / enrich:** `ON CONFLICT (store_id, store_sku)` and `Apply*VariantFanout` share one meaning of “this SKU” and “this family.”

**Success:** A new store can be reviewed against the locked decisions + the mismatch table. Gaps below are named; they are not “how Shopify works.”

## Tech stack

Unchanged: Node scraper (`apps/scraper`), Go ingest (`apps/api/internal/db/listings_upsert.go`, `deals_grouped.go`, `*_pdp_variants.go`), Postgres `store_listings` (`UNIQUE (store_id, store_sku)`, `product_group_key`, `variant_options` JSONB — migration `021`).

Web reads identity via `GET /deals?group_variants=true` and [`inStockVariantChips.ts`](../../apps/web/src/lib/inStockVariantChips.ts) (display kind is already case-insensitive: `size` / `colou?r` / `finish`).

No new runtime dependencies for this spec.

## Commands

```bash
# Scraper identity helpers (Shopify options, Jenson DTO, ION, N+1, …)
pnpm --filter @mtb-aggregator/scraper run test

# API grouping, upsert merge, fan-out, size copy
cd apps/api && go test ./internal/db/... ./internal/metadata/... ./internal/scraper/...
cd apps/api && go vet ./...

# Web chips / SKU size inference
pnpm --filter @mtb-aggregator/web run test
```

## Project structure

```
apps/scraper/src/parsers/shopify-helpers.ts   # buildVariantOptions (retailer names as-is)
apps/scraper/src/parsers/jensonusa-dto.ts     # dimensionKeyToLabel, Size-from-SKU suffix
apps/scraper/src/parsers/*-plp.ts             # store-local SKU / group / Color-or-Size
apps/api/internal/db/listings_upsert.go       # UNIQUE key; merge variant_options (ZAC-276)
apps/api/internal/db/deals_grouped.go         # GROUP BY product_group_key (or single:id)
apps/api/internal/db/*_pdp_variants.go        # named fan-out + parent hide
apps/api/internal/metadata/clothing_size.go   # reads variant_options Size / size only
apps/api/internal/metadata/bike_size.go       # any key containing "size"
apps/web/src/lib/inStockVariantChips.ts       # display kinds; SKU suffix Size fallback
packages/shared/schema.sql                    # store_sku VARCHAR(100)
docs/specs/variant-identity-zac-254.md        # this file
```

## Locked decisions

Correct these before implementation PRs treat them as optional.

1. **Identity is within one store.** `(store_id, store_sku)` is the row. Matching the same Fox 38 at Jenson vs Worldwide Cyclery is **out of scope** (no GTIN/UPC join in this ticket).
2. **Three keys, three jobs.** `store_sku` = purchasable row. `product_group_key` = family for one deal card. `variant_options` = axes on that row (`Size`, `Color`, …). Do not overload `product_name` or `product_url` as the family id.
3. **One row per purchasable SKU when the source enumerates SKUs.** Same as [ZAC-255](scrape-contract-zac-255.md) grain. Parent-then-fan-out is allowed only when the PLP cannot enumerate SKUs.
4. **`store_sku` is unique per `(store_id, store_sku)` and stable across scrapes.** Prefer the retailer’s SKU. Fallback must be deterministic (`v{shopifyVariantId}`, `{masterId}-{colorCode}`, `{productId}-{attributeId}`). Never reuse a parent SKU for a child after fan-out.
5. **Do not change `store_sku` after insert** except an explicit remap (insert new key, hide/migrate the old row). Silent key changes collide with `ON CONFLICT` and orphan price history.
6. **`product_group_key` is the store-local family id.** Parser sends handle / parent code / master id / article number / style id. API stores `{store_id}:{key}`. Omit only when there is no family (true single-SKU product). Ungrouped rows become `single:{listing_id}` at query time — that **fragments** a family if a key was omitted by mistake.
7. **Canonical option keys at ingest** (table below). Retailer labels (`Colour`, `Frame Size`, `colorway`) map to `Size` / `Color` / named others. Display already treats `colou?r` and `size` loosely; **`clothing_size` copy does not** — it looks for `Size` / `size` only.
8. **One scalar value per axis per row.** `Size` is this SKU’s size, not the size chart. Comma-separated charts (`"S, M, L, XL"`) are invalid `variant_options.Size`. Split into child rows, or omit `Size` until fan-out. Slash combos that *are* one purchasable SKU (`S/M`) stay one value. Leftover charts in `llm_specs.clothing_size` are split for facets ([ZAC-248](https://linear.app/zacks-personal-projects/issue/ZAC-248/clothing-sizes-using-comma-separated-list)) — that is a display/filter backstop, not permission to store charts on the row.
9. **Parent tiles must not stay visible once children exist.** Hide superseded parents (Jenson `025`, UC `026`, scheduler re-hide after scrape unhide). Scrape must not emit the parent SKU again as a second live row.
10. **Scrape merges `variant_options`, it does not replace.** Color-only PLP cannot wipe Size from PDP (ZAC-276). Incoming keys overlay; missing incoming keys are kept.
11. **OOS siblings keep their SKU.** Public `/deals` filters `is_in_stock`; grouped JSON may still list `hidden=false` OOS children (ZAC-256). Identity does not use `HideStaleListings` as “this SKU went away.”
12. **Size grain vs color grain.** If the retailer has a distinct orderable id per size, emit one row per size. If size is only inventory on a color pid (typical Demandware), scrape may stay Color-only **if** the group key still collapses colors onto one card; size chips then wait on a named fan-out. Never pack remaining sizes into one string.

## Identity model

```
store_listings
  UNIQUE (store_id, store_sku)          -- row identity (purchasable)
  product_group_key TEXT                -- "{store_id}:{family}"  (card identity)
  variant_options JSONB                 -- {"Size":"M","Color":"Black"}
```

| Key | Who writes | Stability rule | Failure if wrong |
| --- | --- | --- | --- |
| `store_sku` | Parser (or fan-out child code) | Same string every scrape for that purchasable | Collision → upsert overwrites the other variant. Fragment → two live rows for one SKU (parent + child) |
| `product_group_key` | Parser handle; API prefixes `store_id` | Same family id when the retailer family does not change | Missing → `single:{id}` per row (duplicate cards). Unstable → group splits across scrapes |
| `variant_options` | Parser and/or PDP fan-out | Canonical keys; merge on scrape | `Colour` vs `Color` → two chip groups. `Option: "S, M, L"` → Size never copied. Color-only replace → Size chips vanish |

API prefix (already implemented in `listings_upsert.go` / `db.go`):

```go
productGroupKey = fmt.Sprintf("%d:%s", listing.StoreID, strings.TrimSpace(handle))
```

Parsers send the **unprefixed** store-local id (`product.handle`, Jenson parent `code`, Fox `VG-#####`). Fan-out helpers that write the column directly must use the same `{store_id}:{local}` form (they already do).

## Canonical option keys

Normalize **at ingest** (scraper emit and Go fan-out), not only in the UI.

| Canonical key | Map from (case-insensitive) | Used by |
| --- | --- | --- |
| `Size` | `size`, `Size`, `frame size`, `bike size`, `clothing size`, `letter size` | Chips; `clothing_size` (`Size`/`size` only today); `bike_size` (any key containing `size`) |
| `Color` | `color`, `colour`, `colorway`, `colourway`, `finish` | Chips (skip hex-only values — Specialized swatch codes) |
| Keep as-is (Title Case) | `Length`, `Width`, `Travel`, `Wheel Size`, `Dropper`, … | Chips as `kind: "other"` |
| **Do not persist** | `Option 1` / `Option 2` / `Option 3`, `Title`, `Variant` when they are Shopify fallbacks | Re-map from `product.options` names; if still unknown, drop rather than store `Option 1` |
| Universal Cycles `Option` | Attribute `h4` label | Map to `Size` when the label is a size token; otherwise keep `Option` for non-size attributes (length, model year) |

**Values**

- Trim whitespace. Do not lowercase display labels (`GOLD` vs `Gold` may be the retailer’s string; chips already de-dupe case-insensitively).
- Machine colors (`#0a0a0a`, 3–8 hex) may be stored but must not be the only Color if a human label exists (Fox PDP `aria-label` already prefers the name).
- `clothing_size` / `bike_size` copy stays a **derived** field from `variant_options.Size` (or size-like keys for bikes). They are not a second identity.

## Parent–child linking

| Stage | Parent row | Child rows | Visibility |
| --- | --- | --- | --- |
| **PLP-complete** | None | One per SKU; group = product family | All children; no parent |
| **PLP-partial** | None (Jenson emits variant codes from the card) | Variant codes; group = parent code | Children only. Legacy parent SKU (strict prefix of a longer sibling SKU on the same `product_url`) stays **hidden** (`025`) |
| **Tile-then-fan-out** | Tile pid / product id / `{master}-{color}` | PDP `variants[]` with distinct codes | After fan-out, hide parent if children exist (`026` UC; Demandware color tiles **are** the children — do not hide them when size is not split out) |
| **Catalog-flat** | Each Impact item is already a SKU | PDP `hasVariant` sets group + options on matching `store_sku` | No new rows; unmatched catalog SKUs stay ungrouped until a later match |

**Fan-out owners today** (must keep SKU + group recipes in this spec if they change):

| Store | API | Child `store_sku` | Group |
| --- | --- | --- | --- |
| JensonUSA | `ApplyJensonPDPVariantFanout` | Existing variant `code` (updates options/stock; does not insert new SKUs) | `{store_id}:{parent code}` |
| Universal Cycles | `ApplyUniversalCyclesVariantFanout` | `{productId}-{attributeId}` (inserts) | `{store_id}:{productId}` |
| Competitive Cyclist | `ApplyCompetitiveCyclistVariantFanout` | Catalog SKU unchanged; match on normalized `product_url` + `store_sku` | `{store_id}:{pdp slug}` |
| Fox / Bell / Giro | `Apply{Store}PDPVariantFanout` | Existing color pid; human `Color` + stock | `{store_id}:{VG-#####}` / `{store_id}:{masterId}` |

New fan-out **must** be a named `Apply{Store}VariantFanout`, update or insert by `store_sku`, set the prefixed group key, and hide a superseded parent when the child SKU set is non-empty.

## Query-time grouping (read path; do not change without this spec)

`GET /deals?group_variants=true` (`deals_grouped.go`):

- Filter in-stock, non-hidden rows, then `gk = COALESCE(product_group_key, 'single:' || id)`.
- One representative per `gk` (cheapest in-stock).
- Sibling JSON: same `store_id` + same `product_group_key`, `hidden = false` (**includes OOS** siblings for the deal PDP table).

Web chips prefer Size, then Color, then other keys; sold-out options omitted. Deal PDP table lists those siblings with an In stock badge.

## Store mismatch inventory

Honest delta vs the locked decisions. Implementation is **not** this ticket.

| Store / family | Grain today | `store_sku` | `product_group_key` (parser) | `variant_options` | Fragment / collide risk |
| --- | --- | --- | --- | --- | --- |
| **Shopify JSON** (~20 stores) | PLP-complete: one row per `variant` | `variant.sku` or `v{id}` | `product.handle` | Retailer option **names as-is** (`Colour`, `Title`, `Option 1`, `Frame Size`) | **Key drift:** `Colour` vs `Color`; `Option 1` is not Size. Empty SKU fallback is OK. Gravity Cartel / Ride Bicycles **omit** OOS SKUs (ZAC-256, not identity) |
| **JensonUSA** | PLP-partial + PDP fan-out | Variant `code` (often `… COLOR SIZE`) | Parent `code` | DTO facets + Size inferred from code suffix | Parent/child prefix collision if `025` hide not re-applied after scrape unhide. Color-only PLP vs Size: **merge** already in upsert |
| **Backcountry family** | One row per extracted SKU | `sku` | **Unset** | **Unset** | **Fragment:** each SKU is `single:{id}` even when they share a style |
| **Canyon** | Color tile | `{masterId}-{colorCode}` | `masterId` | `Color` (label or code) | Group OK. **No Size rows.** Color code vs name |
| **Specialized** | Color swatch | Swatch `id` | Product `uid` / id | `Color` (name or hex) | Group OK. Hex Color skipped by chips → card looks variant-less. **No Size rows** |
| **Trek OCC** | One row per product `code` | OCC `code` | **Same as SKU** (1:1 group) | `Color` = **all** `colorKeyValue` joined with ` / ` | **Not a variant family.** Sizes never rows. Color is a chart-like list |
| **Universal Cycles** | Parent on scrape; children on PDP | Parent: product id. Child: `{id}-{attributeId}` | Product id | Child: **`Option`: label** (not `Size`) | Parent hide `026`. `clothing_size` ignores `Option`. Label may still be a chart |
| **N+1** | Discounted catalog variants | Variant `sku` or `id` | Group `id` | First-letter capitalize (`color` → `Color`) | Good. Off-sale siblings omitted by sale predicate (not an identity bug) |
| **ION** | Discounted article variants | EAN, else `{article}-{color}-{size}` | Article number | `Color` + `Size` from API | Good. Synthetic SKU only when EAN missing — keep that fallback stable |
| **Fox Racing** | Color tile | `data-pid` (`VG-#####-###`) | `VG-#####` | Scrape: `Color` = **code** (`001`). PDP: human name | Group OK. `parseFoxSelectableSizes` exists and is **not** fanned out — Size chips never appear |
| **Bell** | Color tile | `BL-#####` pid | Master id from PDP URL | `Color` = numeric code until PDP | Group OK when master ≠ pid. Size not rows |
| **Giro** | Color tile | `data-pid` | Master from PDP URL | `Color` = code until PDP | Fixture has **group key = store_sku** (`…101S`) → 1:1 group, color siblings **fragment** |
| **Competitive Cyclist** | Catalog-flat | Impact `CatalogItemId` | **Unset** until PDP `hasVariant` | Unset until PDP | **Fragment** until WAF-gated backfill. Fan-out matches URL+SKU; unmatched catalog rows stay ungrouped |
| **All** | — | `VARCHAR(100)` | — | JSON object, string values only | Truncation would **collide** two long SKUs. Watch Jenson codes with color+size suffixes |

## Ingest merge (identity-relevant)

Already in `listings_upsert.go`; this spec does not re-litigate it:

- Conflict key: `(store_id, store_sku)`.
- `product_group_key = COALESCE(incoming, existing)` (incoming wins if non-null).
- `variant_options`: null/empty incoming → keep; empty existing → take incoming; else **JSONB `||` merge** (incoming keys win).
- `hidden = false` on scrape (then scheduler re-hides Jenson/UC parents).

**Do not** switch merge to replace. **Do not** prefix `product_group_key` twice (parser must not send `{store_id}:handle`).

## What “done” means for a new store (identity)

In addition to the [ZAC-255 scrape checklist](scrape-contract-zac-255.md#what-done-means-for-a-new-store):

- [ ] Grain named: PLP-complete / PLP-partial / tile-then-fan-out / catalog-flat.
- [ ] `store_sku` recipe documented; second scrape does not create duplicates; parent SKU ≠ child SKU.
- [ ] `product_group_key` set whenever two SKUs should share a card; `group_variants=true` collapses a sample product.
- [ ] Option keys are canonical (`Size` / `Color` / …), not `Option 1` / `Colour` / `Option`.
- [ ] No Size (or Color) value on the row is a comma-separated chart.
- [ ] If fan-out: named `Apply{Store}*Fanout`; superseded parent hidden; OOS children kept as rows.
- [ ] Vitest (or Go) fixture asserts SKU, group key, and options for at least two siblings.

## Code gaps vs current parsers

| Gap | Where | Risk | Owner |
| --- | --- | --- | --- |
| Shopify option names not canonicalized | `shopify-helpers.ts` `buildVariantOptions` | Split Color chips; `clothing_size` misses `Frame Size` | Follow-up Task A |
| Shopify `Option 1` / `Title` / `Variant` fallbacks | same | Unusable chip keys | Task A |
| UC `Option` instead of `Size` | `universalcycles-pdp.ts` | No clothing Size from UC rows | Task B |
| Backcountry no group / options | `backcountry-family-plp.ts` | Duplicate cards per SKU | Task C |
| CC no group at catalog ingest | `map_catalog_item.go` | Flat cards until manual PDP | Task D (optional slug-from-URL) |
| Trek 1:1 group + joined Color list | `trek-plp.ts` | No size chips; Color chart on the card | Task E |
| Specialized / Canyon / Fox / Bell / Giro: color grain, no Size rows | `*-plp.ts`, Fox `parseFoxSelectableSizes` unused | Size chips missing on apparel / bikes | Task E (only if PDP size has its own orderable id) |
| Fox/Bell/Giro scrape Color is a machine code | `foxracing-plp.ts`, `bell-plp.ts`, `giro-plp.ts` | Ugly chips until PDP | Prefer PLP human label when present |
| Giro group key can equal pid | `giro-plp.ts` | Color siblings do not group | Fix master-id parse |
| `clothing_size` only reads `Size`/`size` | `clothing_size.go` | Canonical keys (Task A) fix most; UC `Option` still missed | Task A + B |
| `store_sku VARCHAR(100)` | `schema.sql` | Truncation collision | Widen if a store exceeds 100; do not silently slice |
| Dual size inference (parser + web SKU suffix) | `jensonusa-dto.ts`, `inStockVariantChips.ts` | Acceptable display fallback; ingest should still persist `Size` | Keep UI fallback until ingest is complete |

## Follow-up implementation (not this ticket)

This ticket ships the spec. Suggested children under ZAC-161 (do not duplicate ZAC-256):

- **Task A — Canonicalize option keys at ingest**  
  Shared mapper in scraper (`buildVariantOptions` + Jenson `dimensionKeyToLabel` + N+1) and Go fan-out. Map Colour/Frame Size → Color/Size; drop `Option N` / `Title` / `Variant` when a real name exists.  
  Verify: existing Shopify + Jenson vitest; `go test ./internal/metadata ./internal/db`; a `Colour` fixture becomes `Color`.

- **Task B — Universal Cycles axes**  
  Map attribute labels to `Size` when they are size tokens; omit Size when the label is a chart (do not store `"S, M, L, XL"` on the row).  
  Verify: UC PDP fixture + `clothing_size` copy.

- **Task C — Backcountry family key**  
  If the PLP JSON has a style/product id, set `product_group_key` + options; otherwise document catalog-flat.  
  Verify: scraper test + grouped deals sample.

- **Task D — CC group without PDP (optional)**  
  Set `product_group_key` from canonical PDP slug at Impact map time so same-URL SKUs group before WAF cookies. Options still need `hasVariant` or catalog size/color fields.  
  Verify: `go test ./internal/impact ./internal/db`.

- **Task E — Size fan-out for color-tile families**  
  Trek / Specialized / Canyon / Fox / Bell / Giro: only when the PDP exposes a **distinct orderable id per size**. Otherwise keep Color grain and do not invent `{pid}-{size}` children that the retailer cannot checkout. Fox already parses selectable sizes — do not fan-out until SKU identity is confirmed.  
  Verify: per-store fixture; `group_variants=true` still one card; Size chips only from real child SKUs.

## Testing strategy

- **Scraper (vitest):** two siblings share a group key and differ on canonical `Size`/`Color`; parent SKU ≠ child SKU; no chart strings in Size.
- **API (`go test`):** upsert merge does not wipe Size; fan-out hide parent; grouped query collapses siblings; `clothing_size` / `bike_size` copy from `Size`.
- **Web:** `inStockVariantChips` still accepts `colour` / `size` (defense in depth after Task A).
- **No browser** required for this spec.

## Boundaries

- **Always:** Stable unique `store_sku`; family key when a family exists; canonical option keys on new emit; hide superseded parents; merge option maps.
- **Ask first:** Cross-store product matching (GTIN); changing `VARCHAR(100)`; inventing synthetic size SKUs the retailer does not sell; grouping by `product_url` alone when SKUs are not a family.
- **Never:** Reuse parent SKU for a child; replace `variant_options` on scrape; persist size/color **charts** as a single axis value; use `HideStale` as identity; assume UI chip heuristics make ingest keys optional.

## Success criteria (this ticket)

- [x] Spec defines row / family / axis identity and parent–child linking.
- [x] Spec lists concrete store mismatches (not “stores vary”).
- [x] Canonical option keys and “one scalar per axis” are locked. ZAC-248 is cited as the facet backstop, not re-opened.
- [x] Cross-retailer matching is explicitly out of scope.
- [x] Sibling scrape/OOS specs point here; existing docs link this file.
- [x] Linear ZAC-254 links this file (draft PR #303).

## Open questions

None blocking the spec. Implementation order: Task A (keys) + Task B (UC), then C/D, then Task E only where PDP SKUs are real.

**Assumptions** (correct in review if wrong):

1. We do **not** match products across retailers in this workstream.
2. Demandware color pids stay Color-grain until a store proves size has its own orderable id.
3. Shopify `product.handle` remains the family id (not numeric `product.id`); URL backfill in migration `021` already uses the handle.
4. `clothing_size` stays derived from variant Size; it is not a parallel identity key.
