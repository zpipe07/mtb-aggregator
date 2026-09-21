# Spec: Enrichment normalization across stores (ZAC-253)

Parent: [ZAC-161](https://linear.app/zacks-personal-projects/issue/ZAC-161/normalize-scraping-enrichment-variants-across-store) (normalize scraping / enrichment / variants).

Sibling specs:

- [ZAC-255 scrape contract](scrape-contract-zac-255.md) — listing ingest. This spec starts **after** upsert: PDP fetch, classify, extract.
- [ZAC-254 variant identity](variant-identity-zac-254.md) — SKU / group / option keys. Fan-out **identity** lives there; this spec owns **when** a PDP may emit `variants[]` and which named `Apply*` runs.
- [ZAC-256 OOS policy](../ideas/oos-policy-zac-256.md) — when scrape may write `is_in_stock`; OOS stock-check PDP is **stock-only** (no classify/extract).
- [ZAC-211](https://linear.app/zacks-personal-projects/issue/ZAC-211/are-we-scraping-and-saving-description-specs-etc) — persist description/specs so LLM can re-run without a store fetch. Core ask is already true for scheduled classify/extract; leftover is “scrape-time HTML spec tables” (out of scope — listing scrape stays listing-only).
- [ZAC-171](../ideas/enrichment-split-zac-171.md) — operational split (drainer + scrape-triggered LLM). Do not re-litigate cadence here.
- [ZAC-248](https://linear.app/zacks-personal-projects/issue/ZAC-248/clothing-sizes-using-comma-separated-list) — `clothing_size` is derived from variant Size, not an LLM extractable.

Operational store notes stay in [docs/SCRAPING.md](../SCRAPING.md) and [apps/scraper/README.md](../../apps/scraper/README.md). Pipeline ops stay in [docs/ARCHITECTURE.md](../ARCHITECTURE.md) and [apps/api/README.md](../../apps/api/README.md). This file is the **enrichment contract**: one DTO, one step machine, one skip/idempotency story, and a capability row for store quirks.

## Objective

How might we enrich every store the same way — PDP inputs, LLM classify/extract, skip, and retries — so a new retailer does not invent a second pipeline, and store-specific behavior is a table row rather than a new `if store ==` branch?

**Users**

- **Agent / engineer adding a store:** pick an enrich family + capability flags; do not copy an adjacent enricher’s skip logic.
- **Scheduler / Insights:** one meaning of due / skip / dead / success across drainer, burst, hourly LLM, and admin.
- **Rider:** category + spec filters show up after scrape + PDP without waiting on a nightly batch; OOS SKUs do not burn OpenAI.

**Success:** A new store can be reviewed against the locked decisions + the capability table. Gaps below are named; they are not “how Jenson works.”

## Tech stack

Unchanged: Node `POST /enrich` (`apps/scraper`), Go `enrichstate.Pipeline` + `llmlisting` (`apps/api`), Postgres `listing_enrichment` / `pdp_snapshots` / `enrichment_events` (migrations `028`, `042`, `043`, `044`).

No new runtime dependencies for this spec.

## Commands

```bash
# Scraper enrichers (Zod request + per-store PDP fixtures)
pnpm --filter @mtb-aggregator/scraper run test

# Pipeline skip / hash / claim / LLM steps
cd apps/api && go test ./internal/enrichstate/... ./internal/llmlisting/... ./internal/scheduler/... ./internal/db/...
cd apps/api && go vet ./...

# Manual (scraper + API running)
curl -X POST http://localhost:3000/enrich \
  -H "Content-Type: application/json" \
  -d '{"url":"https://worldwidecyclery.com/products/example","store":"worldwidecyclery"}'
curl -X POST 'http://localhost:8080/enrich-now?store=worldwidecyclery'
curl -X POST 'http://localhost:8080/llm-specs-now?store=worldwidecyclery'
```

## Project structure

```
apps/scraper/src/types.ts                    # EnrichRequestSchema, ENRICH_STORE_TYPES
apps/scraper/src/parsers/jensonusa.ts        # EnrichResult interface (canonical DTO)
apps/scraper/src/parsers/index.ts            # ENRICHERS map
apps/scraper/src/parsers/*-pdp.ts            # store-family PDP parsers
apps/api/internal/scraper/client.go          # Go EnrichResult + Enrich()
apps/api/internal/enrichstate/               # Pipeline, skip, hash, leases
apps/api/internal/db/enrichment_state.go     # ClaimForStep, StampLLMSkipInputs
apps/api/internal/db/db.go                   # StoreTypesWithEnrichers
apps/api/internal/llmlisting/pipeline.go     # ClassificationStep, SpecExtractionStep
apps/api/internal/scheduler/                 # Drainer, burst, LLM kicks, Fanout
apps/api/internal/db/*_pdp_variants.go       # Named fan-out (identity in ZAC-254)
docs/specs/enrichment-normalization-zac-253.md  # this file
```

## Locked decisions

Correct these before implementation PRs treat them as optional.

1. **Three durable steps, in order:** `pdp` → `classify` → `extract`. Classify and extract **never** call a store. They read `store_listings` (name, `category_path`, `metadata.description` / `metadata.specs`, existing `llm_category`, `canonical_category`) plus snapshot **presence / hash / `unavailable`**. That is the ZAC-211 contract for LLM.
2. **One `EnrichResult` DTO** for every PDP path (Node enricher and any future Go-side fetch). Fields below. Do not add a second “admin enrich” shape.
3. **Scheduled PDP is allowlisted.** `StoreTypesWithEnrichers` is the scheduled/drainer/burst set. Scraper `ENRICHERS` may be a **superset** (Competitive Cyclist today). A store in `ENRICHERS` but not the allowlist is **admin / backfill only**.
4. **Feed-only stores do not pretend to have a PDP snapshot.** Competitive Cyclist listing ingest is Impact. Catalog `feed_description` merges into `metadata.description` at scrape. Scheduled `ClaimForStep` classify/extract still require a snapshot today — that is a **named gap** (Task D), not a silent exception.
5. **Idempotency keys are step-specific.**
   - PDP: `listing_enrichment.pdp_fetched_at` vs `ENRICH_PDP_STALE_AFTER` (default 30d). Force ignores stale; still respects `pdp_dead` unless the step is reset.
   - LLM: `listing_enrichment.pdp_hash` (content last **processed** by classify/extract) vs `pdp_snapshots.content_hash`, plus `prompt_profile_version` vs the enabled profile’s `updated_at`.
   - **`pdp_hash` is not written on PDP success.** The fresh fetch hash lives on the snapshot. Overwriting `pdp_hash` on fetch would erase “content changed since classification.”
6. **Skip is a first-class outcome**, not a quiet `return`. Record `enrichment_events.skipped` and **`StampLLMSkipInputs`** so `NULL pdp_hash` cannot stay claimable forever (`IS DISTINCT FROM`).
7. **Visibility gate for scheduled claims:** `is_in_stock = true AND hidden = false` plus a product URL. Hidden rows are never due. OOS rows are not due for classify/extract. **ZAC-256** adds a **separate** OOS stock-check PDP (stock/fan-out only; no LLM if still unavailable). Do not widen `listingVisibilityGate` to do that.
8. **Category preserve:** if `metadata` has a manual override, or `llm_category` with confidence ≥ `LLM_CATEGORY_PRESERVE_THRESHOLD` (else classifier threshold, else `0.5`), PDP updates `category_path` + specs/description only — not `canonical_category` / `category_id`.
9. **Extract gap-fills `metadata.llm_specs`.** It does not wipe existing spec-table keys. `clothing_size` is **not** LLM-extractable; `bike_size` may be extracted **and** copied from variant Size. Both copies run after extract and on scrape/fan-out.
10. **Store quirks are a capability row**, not a new pipeline. Allowed quirk columns: enrich family, `scheduled_pdp`, `pdp_variants` + named `Apply{Store}*Fanout`, `llm_without_pdp`, `stock_from_plp` (ZAC-256). New stores pick an existing family before inventing a sixth PDP style.
11. **Fan-out after PDP is identity + stock.** Child SKU / group / option keys follow [ZAC-254](variant-identity-zac-254.md). Listing prices are **not** overwritten from PDP except stores whose fan-out explicitly sets child prices (Universal Cycles attributes).
12. **Do not collect PDP HTML on listing scrape** to satisfy ZAC-211. Sale scrape stays listing-only. Description/specs arrive from PDP (or Impact `feed_description`).
13. **Operator ID-list LLM** (`POST /llm-specs-now`, admin bulk/single llm-specs) may run classify/extract **without** a snapshot when the row already has enough metadata. That path is for profile iteration and CC. It must not become a second scheduled pipeline. Target: same skip/event/hash helpers as `Pipeline` (Task A).

## Pipeline model

```
scrape upsert
    │
    ├─ maybeKickLLMAfterScrape          ──┐
    │   (enricher stores only)            │
    ▼                                     ▼
PDP drainer / POST /enrich-now      llm_specs job
    │                               (classify + extract)
    ├─ POST /enrich  → EnrichResult
    ├─ pdp_snapshots + UpdateListingEnrichment
    ├─ optional Apply*VariantFanout
    └─ OnPDPSuccess → debounced llm_specs
```

| Step | Orchestrator | External I/O | Writes |
| --- | --- | --- | --- |
| **pdp** | `Pipeline.runPDP` → `Scraper.Enrich` | Store PDP | `pdp_snapshots` (payload + `content_hash`); `store_listings` via `UpdateListingEnrichment`; `listing_enrichment.pdp_fetched_at`; optional fan-out; `enrichment_events` |
| **classify** | `Pipeline.runClassify` → `llmlisting.ClassificationStep` | OpenAI only | `canonical_category` / `category_id` if confidence ≥ threshold; else `metadata.llm_category`; `classified_at`, `pdp_hash`, `llm_confidence`, `prompt_profile_version` |
| **extract** | `Pipeline.runExtract` → `llmlisting.SpecExtractionStep` | OpenAI only | `metadata.llm_specs` (gap-fill); `SyncClothingSizeFromVariant` / `SyncBikeSizeFromVariant`; `extracted_at`, `pdp_hash`, `prompt_profile_version` |

**Triggers (do not add a fourth cadence without this spec):**

| Trigger | Job | Steps |
| --- | --- | --- |
| Resident drainer | No `enrich_jobs` row | PDP only; paced per store |
| `POST /enrich-now` / optional `ENRICH_CRON_SPEC` | `job_type=enrich` | PDP only; then kick LLM |
| Successful scrape (enricher stores) | `job_type=llm_specs` (`triggered_by=scrape`) | classify + extract |
| Drainer PDP success (debounced) / burst finalize | `llm_specs` (`triggered_by=pdp`) | classify + extract |
| `LLM_CRON_SPEC` (hourly) + startup catch-up (1h) | `llm_specs` (`triggered_by=cron` / `catch-up`) | classify + extract |
| `POST /llm-specs-now` / admin bulk-llm / `:id/llm-specs` | `llm_specs` or inline | classify + extract **by ID list** (no `ClaimForStep` today) |
| Admin single/bulk enrich | Ad-hoc | Scraper + inline LLM (**no** snapshot / step row today — Task A) |

Startup catch-up does **not** burst PDP. `pdp_last_fetch_at` is stamped when the scraper call **starts** (ZAC-247).

## Inputs

### PDP (`POST /enrich`)

```ts
{ url: string; store: EnrichStoreType }
```

`url` is the listing’s `product_url` (canonical PDP). `store` must be in `ENRICH_STORE_TYPES` (`STORE_TYPES` + `competitivecyclist`).

The enricher must not require listing id, SKU, or prior metadata. Fan-out uses the claimed `WorkItem` (`store_sku`, `store_type`) on the API side.

### Classify (`llmlisting.ClassificationStep`)

| Input | Source |
| --- | --- |
| `product_name` | `store_listings` |
| `category_path` | `store_listings` (scrape and/or last PDP) |
| `description` | `metadata.description` (PDP or Impact feed) |
| `specs` | `metadata.specs` (PDP `raw_specs`) |
| Valid tree paths + rubrics | `categories` |
| Skip if | Classifier disabled; empty tree; **manual category override** |

Does **not** read the snapshot JSON body. Snapshot is only a claim/skip gate (`pdp_fetched_at`, `unavailable`, hash).

### Extract (`llmlisting.SpecExtractionStep`)

Same listing text fields as classify, plus:

| Input | Source |
| --- | --- |
| `canonical_category` | Required; empty → skip |
| Effective prompt profile | Enabled profiles on the category path (child field_key wins) |

`clothing_size` stays `extractable=false`. `bike_size` is extractable on the Bikes parent profile **and** copied from variant Size.

## Field contract (`EnrichResult`)

Shared TypeScript (`apps/scraper/src/parsers/jensonusa.ts`) and Go (`apps/api/internal/scraper/client.go`). There is **no Zod `EnrichResultSchema` today** (Task E).

| Field | Required | Rules | Ingest notes |
| --- | --- | --- | --- |
| `category_path` | Nullable | Short shoppable labels (`isPlausibleCategoryLabel`). Empty/null does not wipe an existing path | Taxonomy map + refine **unless** category preserve |
| `raw_specs` | Nullable | `Record<string, string>` spec-table / JSON keys | Merged into `metadata.specs` |
| `description` | Optional | PDP body / `body_html` text, not marketing H1s | Merged into `metadata.description` |
| `unavailable` | Optional | `true` = this PDP is gone / 404 / sold-out as a product | Sets `is_in_stock=false`; **no** classify/extract |
| `variants` | Optional | Only when the family is PLP-partial or tile-then-fan-out ([ZAC-255](scrape-contract-zac-255.md) grain) | Named `Apply*` fan-out; identity per [ZAC-254](variant-identity-zac-254.md) |

### `variants[]` (`PdpEnrichVariant`)

| Field | Required | Rules |
| --- | --- | --- |
| `code` | Yes | Child `store_sku` or the existing variant code the fan-out matches |
| `dimensions` | Yes | Canonical option keys (`Size`, `Color`, …) |
| `is_orderable` | Yes | Stock for that SKU |
| `current_price` / `original_price` | Optional | Only when the PDP is the price source for **new** child rows (UC) |

**Do:** return `unavailable: true` on a real 404 / hard sold-out product page (not one OOS size). Return `variants[]` for every sibling the fan-out must update so the API can do **one PDP per `product_group_key`**.

**Do not:** invent `variants[]` on PLP-complete Shopify stores just to echo scrape grain. Do not put a size **chart** in `dimensions.Size`.

### Snapshot hash

`HashSnapshotPayload` is SHA-256 of normalized JSON: `category_path`, sorted `raw_specs`, `unavailable`, `description`, and **`variants` when present**.

**Lock for new work:** LLM invalidation should key off **text** (`category_path`, `raw_specs`, `description`, `unavailable`). Variant stock/price changes must **not** by themselves re-run classify/extract (Task C). Fan-out still applies on every PDP.

## Idempotency

```
PDP due?     pdp_fetched_at IS NULL OR age ≥ ENRICH_PDP_STALE_AFTER
             AND not pdp_dead AND lease expired AND visibility gate
             AND store in allowlist AND (drainer: not paced / cooldown)

LLM due?     pdp_fetched_at set AND snapshot exists AND NOT unavailable
             AND not step_dead AND backoff clear AND visibility gate
             AND (classified_at/extracted_at IS NULL
                  OR pdp_hash IS DISTINCT FROM snapshot.content_hash
                  OR prompt profile updated_at > prompt_profile_version)
             extract also: canonical_category set AND enabled profile exists

LLM skip?    step already completed AND NOT llmInvalidated → skipped + stamp
Force?       PDP burst force ignores stale; LLM scheduled jobs pass force=false
             Admin retry: ResetStepState (clears completion; PDP also clears pdp_hash)
```

| Mechanism | Default | Role |
| --- | --- | --- |
| `*_leased_until` + `FOR UPDATE SKIP LOCKED` | `ENRICH_CLAIM_LEASE` 10m | No double-process |
| Attempts + `next_*_attempt_at` | exp backoff; max 5 | Dead letter per step |
| `StampLLMSkipInputs` | fill-only | Stops NULL-hash reclaim loops (migration `044` backfill) |
| Per-store `pdp_last_fetch_at` / `pdp_cooldown_until` | 15s / 30m | Drainer politeness + circuit breaker |
| `ENRICH_MAX_LISTINGS` | 0 = unlimited | Per **step** per job |

## When to skip

Uniform rules. Store-specific “don’t enrich this SKU” is **not** allowed except via the capability table (no scheduled PDP; feed-only LLM).

| Condition | PDP | Classify | Extract |
| --- | --- | --- | --- |
| `hidden = true` | Skip (not claimed) | Skip | Skip |
| `is_in_stock = false` | Skip scheduled enrich; **ZAC-256** stock-check only | Skip | Skip |
| Snapshot `unavailable` | Success with stock write; no LLM kick if still OOS | Skip | Skip |
| Store not in `StoreTypesWithEnrichers` | Skip scheduled; admin/backfill only if in `ENRICHERS` | Scheduled claim uses the same allowlist | Same |
| No product URL | Skip | Skip | Skip |
| PDP not stale (and not force) | Skip | — | — |
| Drainer min-interval / cooldown | Skip (release lease; no success event) | — | — |
| No snapshot / `pdp_fetched_at` | — | Skip (wait for PDP) | Skip |
| Manual category override | Still fetch PDP specs | Skip classify | Extract still runs if category + profile exist |
| Classifier disabled / empty tree | — | Success no-op today (gap) | — |
| No `canonical_category` | — | — | Skip |
| No enabled prompt profile | — | — | Skip |
| Same hash + same profile version | — | Skip + stamp | Skip + stamp |
| Step dead / backoff / leased | Skip | Skip | Skip |
| OpenAI quota exhausted | PDP still persists | Halt further LLM for that job | Same |
| ZAC-256 OOS stock-check | Stock/fan-out only | Must skip | Must skip |

**Post-scrape LLM kick** is allowed to no-op until the drainer writes a snapshot. That is expected, not a store exception.

## How store-specific quirks are encoded

Target encoding (implementation may still be maps + comments until Task B):

```
store_type → {
  enrich_family,          // shopify-json | jenson-pdp | demandware-pdp | specialized-pdp
                          // | trek-pdp | uc-html | n1-pdp | ion-pdp | backcountry-pdp
                          // | impact-admin
  scheduled_pdp,          // in StoreTypesWithEnrichers
  pdp_variants,           // emit EnrichResult.variants
  fanout,                 // Apply{Store}PDPVariantFanout or none
  llm_without_pdp,        // Impact feed_description is enough for operator LLM
  stock_from_plp,         // ZAC-256; does not change LLM skip
}
```

**Do not** add per-store branches in `ShouldSkipLLMStep`, `ClaimForStep`, or `llmlisting`. Fan-out stays a list of named no-op-unless-match functions until a registry exists; each function must stay a no-op for other stores.

### Capability matrix (today)

| Family | Stores | `scheduled_pdp` | Typical PDP payload | `pdp_variants` / fan-out |
| --- | --- | --- | --- | --- |
| **Shopify JSON** | WWC, Revel, Thunder, Mack, Ride Concepts, Leatt, Chromag, Gravity Cartel, Bikes Online, Evo, Cambria, 365, Lost Co, Hayes, Race Face, Colorado, Canfield, Cased, Ride Bicycles | Yes | `category_path`, `raw_specs`, `description` from `/products/{handle}.json` + HTML | No. Variants already scraped. |
| **JensonUSA PDP** | `jensonusa` | Yes | Breadcrumbs + `serverSideViewModel.variants` | Yes → `ApplyJensonPDPVariantFanout` (update existing codes; group parent code) |
| **Backcountry family** | `backcountry` | Yes | Specs / path | No |
| **Demandware PDP** | Canyon, Fox, Bell, Giro | Yes | Path + specs; Fox/Bell/Giro color variants | Fox/Bell/Giro → `Apply{Store}PDPVariantFanout` (color pid). Canyon: no API fan-out |
| **Specialized PDP** | `specialized` | Yes | Path + specs | No (color grain on scrape) |
| **Trek PDP** | `trek` | Yes | Path + specs | No (OCC code grain) |
| **UC HTML** | `universalcycles` | Yes | `#attribute_*` blocks | Yes → `ApplyUniversalCyclesVariantFanout` (insert `{id}-{attr}`, hide parent) |
| **N+1 PDP** | `n1bikes` | Yes | Specs / path | No (catalog variants on scrape) |
| **ION PDP** | `ion` | Yes | Specs / path | No (article variants on scrape) |
| **Impact admin** | `competitivecyclist` | **No** | WAF-gated `hasVariant` | Admin / `backfill-cc-variants` only → `ApplyCompetitiveCyclistVariantFanout`. LLM text = catalog `feed_description` |

## Store mismatch inventory

Honest delta vs the locked decisions. Implementation is **not** this ticket.

| Store / path | What happens today | Contract | Risk |
| --- | --- | --- | --- |
| **Admin single/bulk enrich** | Calls scraper + `UpdateListingEnrichment` + `llmlisting` **without** `pdp_snapshots` / `listing_enrichment` / events | Same write path as `Pipeline` | Insights due gauges lie; next claim re-PDPs |
| **`llm-specs-now` / bulk-llm** | ID list; no `ClaimForStep`, no stamp, no per-listing events | Same skip/hash/events helpers | Operator runs do not clear hourly due; CC depends on this path |
| **Competitive Cyclist** | Not in allowlist; scrape does not kick LLM; Impact description on the row | Feed-only: operator LLM OK; scheduled claim should accept “feed snapshot” or an explicit ingest-time snapshot (Task D) | CC never appears on hourly classify due |
| **Post-scrape `llm_specs`** | Kicks immediately; claims require snapshot | Allowed no-op until PDP | Looks like “LLM after scrape” but new rows wait on drainer |
| **Hash includes `variants`** | Stock/price change on Jenson/UC/Fox invalidates LLM | Text-only LLM hash (Task C) | Waste OpenAI on restocks |
| **Classifier no-op** | Disabled classifier / empty tree / manual override → `ClassificationStep` returns nil → pipeline records **success** + hash | Success only when classify ran or was an explicit skip | `classified_at` set without a category |
| **`ENRICHERS` vs allowlist** | CC in scraper only | Documented superset; keep | Admin PDP button hidden (`StoreTypesWithEnrichers` API) — correct |
| **Duplicate fan-out lists** | `enrichment_pipeline.go` and `handlers.go` both call every `Apply*` | One `Fanout` callback (Task F) | New store fan-out added in one place only |
| **Legacy `GetListingsNeedingEnrichment`** | 7-day `last_enriched_at` | Prefer `listing_enrichment` | Agents may wire the wrong helper |
| **Shopify enrich vs scrape grain** | Enrich does not fill `variant_options` | Correct — scrape owns options | Do not “fix” by emitting chart `variants[]` |
| **Trek / Specialized / Canyon** | PDP has no size SKUs | Do not fan-out sizes ([ZAC-254](variant-identity-zac-254.md) Task E) | Fake children |
| **TWO_PHASE_ENRICHMENT.md** | Nightly 2am, batch 50, 7-day stale | Stale doc | Agents copy the old cadence |

## What “done” means for a new store (enrich)

In addition to the [ZAC-255 scrape checklist](scrape-contract-zac-255.md#what-done-means-for-a-new-store) and [ZAC-254 identity checklist](variant-identity-zac-254.md#what-done-means-for-a-new-store-identity):

### 1. Family + registration

- [ ] Enrich family chosen from the matrix (or a short ADR if none fit).
- [ ] `enrich{Store}(url): Promise<EnrichResult>` registered in `ENRICHERS`.
- [ ] `EnrichRequestSchema` / `ENRICH_STORE_TYPES` includes the store.
- [ ] **Scheduled PDP:** `store_type` appended to `StoreTypesWithEnrichers` **or** the PR says “admin/backfill only” (CC pattern).
- [ ] `make enrich-now-{store}` when scheduled.
- [ ] One paragraph in [docs/SCRAPING.md](../SCRAPING.md) + scraper README (PDP source: JSON vs HTML vs WAF).

### 2. Result contract

- [ ] Returns `category_path` and/or `raw_specs` and/or `description` (at least one useful LLM input).
- [ ] `unavailable: true` on hard-gone PDPs.
- [ ] `variants[]` **only** if grain is PLP-partial or tile-then-fan-out; then a named `Apply{Store}*Fanout` and parent-hide rule.
- [ ] No size/color **charts** in `dimensions`.
- [ ] Category preserve still applies (do not special-case the store in `UpdateListingEnrichment`).

### 3. Skip / LLM

- [ ] Scheduled claims use the shared gate (no store-local skip in `transitions.go`).
- [ ] If `llm_without_pdp`: document operator path (`llm-specs-now`) until Task D.
- [ ] After one successful PDP, hourly `llm_specs` can classify (and extract once a category + profile exist).

### 4. Tests

- [ ] Vitest: fixture HTML/JSON → `EnrichResult` (path, a spec key, `unavailable` if the family has 404).
- [ ] If `variants[]`: two siblings, stable codes, `is_orderable` on an OOS child.
- [ ] Go fan-out test when adding `Apply*`.
- [ ] Fixtures sanitized (no live widget keys).

### 5. Out of scope for “enrich done”

Affiliate networks, WAF cookie rotation runbooks, prompt-profile field lists, and scrape pagination. A scrape-only store (Impact listings) can ship without `scheduled_pdp` if `llm_without_pdp` is documented.

## Code gaps vs current pipeline

| Gap | Where | Risk | Owner |
| --- | --- | --- | --- |
| Admin/bulk enrich bypasses `enrichstate` | `handlers.go`, `bulk_listings_admin.go` | Metrics + skip diverge | Task A |
| ID-list LLM bypasses claim/stamp/events | `llm-specs-now`, admin llm-specs | Same; CC depends on it | Task A + D |
| No feed snapshot for CC | `ClaimForStep`, `map_catalog_item.go` | CC unclassified until manual | Task D |
| Snapshot hash includes variant stock | `enrichstate/normalize.go` | Restock → re-LLM | Task C |
| No Zod `EnrichResultSchema` | `types.ts` | Node/Go drift (same class as scrape dual validation) | Task E |
| Fan-out call sites duplicated | scheduler + handlers | Missed store on one path | Task F |
| Classifier nil → classify success | `llmlisting` + `runClassify` | False `classified_at` | Follow-up with Task A |
| `StoreTypesWithEnrichers` hand-copied | `db.go` vs `ENRICHERS` | New store scheduled without enricher (or the reverse) | Task B |
| Legacy 7-day `last_enriched_at` helpers | `db.go` | Wrong due set | Prefer step tables; delete or wrap |
| `TWO_PHASE_ENRICHMENT.md` stale | `docs/` | Agents implement nightly batch | This PR (pointer) |
| ZAC-256 OOS stock-check not in claim SQL | `enrichment_state.go` | Documented; not this ticket | ZAC-256 Phase 2 |

## Follow-up implementation (not this ticket)

This ticket ships the spec. Suggested children under ZAC-161 (do not duplicate ZAC-254 / ZAC-255 / ZAC-256):

- **Task A — Single write path**  
  Admin single/bulk enrich and ID-list LLM go through `Pipeline.RunWorkItem` / shared record+stamp helpers so snapshots, leases, events, and `pdp_hash` stay consistent.  
  Verify: `go test ./internal/enrichstate ./internal/scheduler ./internal/api`; Insights due count moves after an admin enrich.

- **Task B — Capability registration**  
  One source of truth for `{store → scheduled_pdp, family, fanout}`. Generate or test that `ENRICHERS` keys and `StoreTypesWithEnrichers` match except documented admin-only stores.  
  Verify: a unit test fails if a scheduled type has no enricher.

- **Task C — Split LLM hash from variant stock**  
  Hash text fields for `pdp_hash` invalidation; keep a separate variants digest for fan-out/debug if needed.  
  Verify: changing only `is_orderable` does not make `llmInvalidated` true.

- **Task D — Feed-only LLM eligibility**  
  For `llm_without_pdp` stores, either write a scrape-time snapshot from `feed_description` or let `ClaimForStep` treat non-empty `metadata.description` as the snapshot. Hourly cron then covers CC.  
  Verify: `go test ./internal/db ./internal/impact ./internal/enrichstate`; a CC fixture becomes classify-due without PDP.

- **Task E — `EnrichResultSchema`**  
  Zod on `POST /enrich` responses; keep Go `EnrichResult` aligned.  
  Verify: scraper tests; a missing `code` on a variant is dropped or 500 per the scrape error policy (throw only on total collapse).

- **Task F — One fan-out entry point**  
  Shared callback used by drainer, burst, and admin.  
  Verify: adding a no-op store does not require a second list.

## Testing strategy

- **Scraper (vitest):** one happy-path `EnrichResult` per family already in-repo; new stores add a fixture as in “done” §4.
- **API (`go test`):** `StepDue` / `ShouldSkipLLMStep` / `HashSnapshotPayload`; claim visibility; category preserve; fan-out hide-parent. DB tests that need Postgres stay behind `TEST_DATABASE_URL`.
- **No browser** required for this spec.
- **Do not** start the PDP drainer or Playwright to review the spec.

## Boundaries

- **Always:** LLM is DB-only; skip is stamped; `pdp_hash` means “LLM consumed this snapshot”; new stores pick a family + capability row; OOS/hidden stay off scheduled LLM.
- **Ask first:** Scheduled PDP for a WAF store; collecting spec HTML on scrape; changing the 30d PDP horizon or hash composition; widening claims to OOS (that is ZAC-256).
- **Never:** Call OpenAI from a parser; overwrite a confident LLM category on PDP; emit size charts as `variants[].dimensions.Size`; treat admin enrich as “done” if it skipped `pdp_snapshots`; use `HideStaleListings` as an enrich skip signal.

## Success criteria (this ticket)

- [x] Spec defines PDP / classify / extract inputs, idempotency keys, and a uniform skip table.
- [x] Spec encodes store quirks as a capability matrix (not “stores vary”).
- [x] ZAC-211 (LLM without refetch), ZAC-256 (OOS stock-check), and ZAC-254 (fan-out identity) are cited, not re-opened.
- [x] Spec lists concrete pipeline gaps and follow-up tasks A–F.
- [x] Sibling scrape/identity/OOS docs and architecture/READMEs point here.
- [ ] Linear ZAC-253 links this file (this PR).

## Open questions

None blocking the spec. Implementation order: Task A (one write path) + Task B (registration test), then Task C (hash), then Task D (CC feed snapshot), then E/F.

**Assumptions** (correct in review if wrong):

1. We will **not** add River / LISTEN / a second worker. Postgres `listing_enrichment` stays the queue.
2. Competitive Cyclist stays off the resident drainer until WAF is a solved production cookie — Task D is LLM-only.
3. `clothing_size` / `bike_size` remain derived (plus optional LLM for `bike_size`); they are not a parallel enrich step.
4. Prompt-profile field lists and classifier rubrics stay in [docs/TAXONOMY.md](../TAXONOMY.md) / admin; this spec only says extract is a no-op without an enabled profile.
5. [docs/TWO_PHASE_ENRICHMENT.md](../TWO_PHASE_ENRICHMENT.md) is historical; [ZAC-171](../ideas/enrichment-split-zac-171.md) + this file are current.
