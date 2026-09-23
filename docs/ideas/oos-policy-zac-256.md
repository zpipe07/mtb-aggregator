# OOS Policy: Skip Wasteful Work, Still Detect Restocks (ZAC-256)

## Problem Statement

How might we stop spending PDP/enrichment budget on out-of-stock variants while still noticing when a deal comes back?

## Locked decisions (ZAC-256)

These are the policy calls this spec proceeds with. Correct them before implementation if any are wrong.

1. **Waste we are cutting:** Re-PDP after no-signal scrapes (Jenson / Trek / Specialized / Bell / Giro / Fox / UC). That path is both the restock signal *and* the leak: scrape always writes `is_in_stock=true`, so the listing is claimable again. Extra Shopify OOS rows are cheap and useful — keep them. LLM classify/extract already skip OOS / `unavailable`.
2. **Restock SLA:** The ~4h scrape cadence is enough. No faster stock poll. No-signal stores accept a slower restock (stock-check PDP, default **24h**) because sale-page presence is not a stock signal.
3. **Keep OOS rows.** Persist them. Public `GET /deals` stays `is_in_stock=true AND hidden=false`. Admin, grouped sibling JSON, and the deal PDP variant table may still see OOS siblings. Do not drop OOS SKUs from scrape (Gravity Cartel / Ride Bicycles should stop skipping `!variant.available`).
4. **Scrape may overwrite `is_in_stock` only when the PLP (or catalog) has a real stock flag.** No-signal scrapes must not overwrite PDP/fan-out stock. That is the Jenson re-PDP loop — and it can also put a sold-out SKU back on `/deals` until the next PDP (up to 30d).
5. **This ticket** ships the spec + plan. Implementation is the task list below (same ticket or a child). Sibling specs ([ZAC-255 scrape contract](../specs/scrape-contract-zac-255.md), [ZAC-253 enrichment](../specs/enrichment-normalization-zac-253.md), [ZAC-254 variant identity](../specs/variant-identity-zac-254.md)) stay separate; they should adopt the contract field defined here.

## Recommended Direction

Three signals, cheapest first:

| Signal | What it means | Cost | Use for |
| --- | --- | --- | --- |
| **PLP / catalog stock** (`variant.available`, Impact `StockAvailability`, Canyon limited-stock, N1 supplier qty) | Authoritative `is_in_stock` on scrape | Already paid on scrape | Write stock on upsert. Restock = next scrape flip. No PDP for stock. |
| **Sale-page presence** (`last_scraped` + `HideStaleListings`) | Still on /sale (or left /sale) | Already paid on scrape | Unhide / hide. **Not** stock. Jenson lists OOS tiles on clearance. |
| **Stock-check PDP** | Re-fetch PDP, apply `unavailable` / variant `is_orderable` / fan-out only | One enricher call | Only for **no-signal** stores, only for **OOS + not hidden** rows, on `ENRICH_OOS_STOCK_CHECK_AFTER` (default 24h). Skip classify/extract if still unavailable. |

Do **not** use full PDP + LLM as a stock poll. In-stock PDP stale horizon stays **30d**.

### Rules

1. **Insert:** first time we see a SKU, accept scrape `is_in_stock` (no-signal stores today send `true` — that is how they enter the first PDP).
2. **Update + `stock_from_plp=true`:** `is_in_stock = EXCLUDED.is_in_stock` (today’s behavior).
3. **Update + `stock_from_plp=false`:** leave `is_in_stock` unchanged. Still update price, URL, image, `hidden=false`, `last_scraped`.
4. **PDP / variant fan-out** remains the writer of stock for no-signal stores (Jenson `is_orderable`, UC attributes, Demandware swatches, `unavailable`).
5. **`ClaimForStep` PDP** stays in-stock-only for normal enrich. Add a **separate OOS stock-check claim** (below), not a widening of `listingVisibilityGate`.
6. **Classify / extract** stay gated on in-stock + snapshot not `unavailable`.
7. **`HideStaleListings`** stays “left the sale page,” not OOS.

### Contract addition (also for ZAC-255)

Add optional `stock_from_plp` to `ScrapeResult` (default **false** if omitted — fail closed):

```ts
{
  is_in_stock: boolean;
  stock_from_plp?: boolean; // true = upsert may overwrite is_in_stock
}
```

Go `scraper.ScrapeResult` gets the same field. Impact CC mapping sets `StockFromPLP: true` when it has a catalog availability field (empty field still defaults in-stock today — keep that, but mark the write as catalog-sourced).

## Current store classification

### `stock_from_plp=true` (scrape may overwrite)

Shopify-style `variant.available` (or equivalent): Worldwide Cyclery, Revel, Thunder Mountain, Mack Cycle, Ride Concepts, Leatt, Chromag, Bikes Online, Evo, Cambria, 365 Cycles, The Lost Co, Hayes, Race Face, ION, Colorado Cyclist, Canfield, Cased, N1 (supplier qty).

Also: Canyon (`!limitedStock`), Backcountry-family PLP (`isInStock`), Competitive Cyclist Impact catalog (`StockAvailability` / similar).

**Align to this group (today they drop OOS SKUs):** Gravity Cartel, Ride Bicycles — emit the variant with `is_in_stock: variant.available` and `stock_from_plp: true` instead of `if (!variant.available) continue`.

### `stock_from_plp=false` (preserve stock on update)

JensonUSA, Trek, Specialized, Bell, Giro, Fox Racing, Universal Cycles. PLP always sends `is_in_stock: true`. Stock is refined on PDP / fan-out.

## Restock matrix

| Store class | Goes OOS | Comes back |
| --- | --- | --- |
| PLP stock | Scrape writes `false`; `/deals` drops the row; no PDP | Next scrape writes `true` (~4h) |
| PLP droppers (today) | SKU missing → HideStale **hides** (wrong signal) | Reappears → unhide. After align: same as PLP stock |
| No-signal | PDP / fan-out writes `false`; scrape **must not** flip back to `true` | Stock-check PDP on 24h cadence, or sooner if an in-stock sibling in the same `product_group_key` is PDPed and fan-out updates this SKU |
| Left /sale | HideStale `hidden=true` | Next full scrape upserts `hidden=false`. Stock unchanged unless `stock_from_plp` |

## Why the no-signal overwrite is worse than “extra Shopify rows”

`upsertListingOnConflictSQL` always does `is_in_stock = EXCLUDED.is_in_stock` and `hidden = false`.

For Jenson-style stores that means:

1. PDP marks a variant OOS (or `unavailable`).
2. Next scrape (~4h) writes `is_in_stock=true`.
3. The SKU can reappear on public `/deals` until the next in-stock PDP claim (stale horizon **30d** if `pdp_fetched_at` is fresh).
4. If `pdp_fetched_at` is null on a sibling that fan-out marked OOS, the drainer treats it as never-fetched and PDPs it again.

So the bug is **correctness** (false in-stock on `/deals`) as well as **waste** (re-PDP).

## MVP Scope

### Phase 1 — Stop the overwrite (correctness)

- Add `stock_from_plp` on scrape/Impact results; set it in every parser (true/false as classified above).
- Upsert ON CONFLICT: apply `is_in_stock` only when `stock_from_plp` is true; otherwise keep `store_listings.is_in_stock`.
- Tests: no-signal update preserves OOS; PLP update can restock; insert still accepts scrape stock.
- Gravity Cartel + Ride Bicycles emit OOS rows.

### Phase 2 — Restock for no-signal stores

- New claim path (or `ClaimForStep` mode) for `is_in_stock=false AND hidden=false`, enricher stores only, `pdp_fetched_at` older than `ENRICH_OOS_STOCK_CHECK_AFTER` (default 24h), still paced by the existing PDP drainer / per-store interval.
- Apply enrich result stock + variant fan-out. If `unavailable` or still OOS: do **not** kick LLM. If restocked: existing in-stock PDP/LLM rules apply (hash / profile).
- Prefer one PDP per `product_group_key` when fan-out already updates siblings (Jenson / UC / Demandware color groups).

### Phase 3 — Docs / contract

- ZAC-255 scrape contract ([docs/specs/scrape-contract-zac-255.md](../specs/scrape-contract-zac-255.md)) cites `stock_from_plp`.
- ZAC-253 enrichment ([docs/specs/enrichment-normalization-zac-253.md](../specs/enrichment-normalization-zac-253.md)) notes: OOS stock-check is stock-only; classify/extract stay skipped.

## Not Doing (and Why)

- **Dropping OOS Shopify rows** — restock is a free scrape flip; grouped deal cards/PDP need sibling rows; HideStale is the wrong signal.
- **Faster-than-scrape stock poll** — no watchlist / push product yet; 4h (PLP) / 24h (no-signal) is enough.
- **Using `HideStaleListings` as OOS** — “left /sale” ≠ sold out. Thin/truncated scrapes already skip hide (ZAC-270).
- **LLM on OOS** — already skipped; do not reopen.
- **Competitive Cyclist scheduled PDP** — still WAF-blocked; catalog stock is the signal.
- **Per-store stock-check UI** — env default only (`ENRICH_OOS_STOCK_CHECK_AFTER`).
- **New queue / River** — reuse `listing_enrichment` leases + drainer.

## Success Criteria

- [ ] No-signal scrape of an existing OOS row does not set `is_in_stock=true`.
- [ ] PLP-signal scrape of an OOS row can set `is_in_stock=true` on the next run (restock).
- [ ] Gravity Cartel / Ride Bicycles persist OOS variants (`is_in_stock=false`) instead of omitting them.
- [ ] Public `/deals` still requires in-stock + not hidden.
- [ ] Classify/extract still skip OOS and `unavailable` snapshots.
- [ ] No-signal OOS rows that stay on /sale get a stock-check PDP on the 24h cadence (not every scrape, not only at 30d).
- [ ] A stock-check that remains OOS does not enqueue classify/extract.
- [ ] Unit tests cover upsert preserve vs overwrite and Gravity/Ride OOS emission.

## Implementation plan

### Task 1 — Contract field

- **Acceptance:** `stock_from_plp` on scraper Zod schema + Go `scraper.ScrapeResult` / Impact mapper.
- **Verify:** `pnpm --filter @mtb-aggregator/scraper run test`; `cd apps/api && go test ./internal/scraper/... ./internal/impact/...`
- **Files:** `apps/scraper/src/types.ts`, `apps/api/internal/scraper/client.go`, `apps/api/internal/impact/map_catalog_item.go`

### Task 2 — Parser flags + Gravity/Ride emit

- **Acceptance:** Every parser sets `stock_from_plp` per the classification table. Gravity/Ride emit unavailable variants.
- **Verify:** existing parser tests plus cases for `available: false` on Gravity/Ride (WWC-style).
- **Files:** `apps/scraper/src/parsers/*.ts` and `*.test.ts`

### Task 3 — Upsert preserve

- **Acceptance:** Batch + single-row ON CONFLICT honor `stock_from_plp`. Scheduler/upsert DTO carries the flag.
- **Verify:** `go test ./internal/db/...` (listings upsert tests); `go test ./internal/scheduler/...` if ingest maps the field.
- **Files:** `apps/api/internal/db/listings_upsert.go`, `listings_upsert_test.go`, scheduler ingest mapping

### Task 4 — OOS stock-check claim

- **Acceptance:** Drainer (or a sibling loop) claims due OOS rows; success updates stock/fan-out only unless restocked.
- **Verify:** `go test ./internal/db/... ./internal/enrichstate/...` for claim SQL and “no LLM kick if still OOS.”
- **Files:** `apps/api/internal/db/enrichment_state.go`, `apps/api/internal/enrichstate/`, `apps/api/internal/scheduler/pdp_drainer.go`

### Task 5 — Docs

- **Acceptance:** This file stays the policy source. `docs/SCRAPING.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md` data-flow, `apps/api/README.md` env (`ENRICH_OOS_STOCK_CHECK_AFTER`) match the code.
- **Verify:** doc review on the implementation PR.

## Testing Strategy

- **Scraper (vitest):** `stock_from_plp` on fixtures; Gravity/Ride OOS emission; Jenson/Trek/etc. omit or false.
- **API (`go test`):** upsert preserve/overwrite; ClaimForStep still excludes OOS from normal PDP/LLM; new OOS stock-check eligibility; Impact `StockFromPLP`.
- **No browser / E2E** required for the policy change unless a listing fixture is used to prove `/deals` does not resurrect an OOS no-signal SKU after a mock scrape.

## Commands

```bash
pnpm --filter @mtb-aggregator/scraper run test
cd apps/api && go test ./internal/db/... ./internal/enrichstate/... ./internal/scraper/... ./internal/impact/... ./internal/scheduler/...
cd apps/api && go vet ./...
```

## Closed leftovers

- **24h vs 7d stock-check:** **24h stays.** That is the no-signal restock SLA. Volume is bounded by the existing **15s/store** PDP pace (stock-check shares the drainer; it cannot stampede). If Insights OOS-due age grows, set `ENRICH_OOS_STOCK_CHECK_AFTER=168h` without a code change. Do not start at 7d without evidence.
- **Canyon `limitedStock`:** **Stays a PLP signal** (`stock_from_plp=true`). The tile regex `/only available in/i` means “not buyable from this sale page” (geo/config), not inventory qty. For a US deals site that is the right `is_in_stock=false`; restock is the next scrape when the banner is gone. Demote to no-signal only if we see false OOS from marketing copy or false in-stock while sizes are sold out.
- **`stores.stock_signal` column:** **Not in MVP.** Payload `stock_from_plp` is enough; add a store column later if admin needs to see the class.

## Assumptions to invalidate if production disagrees

- [ ] Jenson / Trek / Specialized / Bell / Giro / Fox / UC sale pages list OOS SKUs (so presence ≠ stock).
- [ ] Shopify `available` is trustworthy enough to write stock without PDP.
- [ ] A 24h no-signal stock-check fits existing 15s/store PDP pace (OOS subset only).
- [ ] Canyon “Only available in” is a stable buyability signal, not noisy copy.
