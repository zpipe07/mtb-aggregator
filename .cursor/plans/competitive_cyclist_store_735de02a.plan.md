---
name: Competitive Cyclist store
overview: Add Competitive Cyclist as a supported retailer by reusing the Backcountry-class Playwright + embedded-state extraction pattern (family sites), optionally generalizing scrape config to multiple URLs per store for CC’s split sale taxonomy pages and future retailers.
todos:
  - id: discover-network
    content: "US browser: HAR / Network tab on CC sale PLP + PDP; note JSON endpoints vs WAF; optional fixture export"
    status: pending
  - id: refactor-family-scrape
    content: Extract Backcountry Playwright+inject into shared origin-aware module; register competitivecyclist parser
    status: pending
  - id: enrich-cc
    content: Share or clone Backcountry enricher for competitivecyclist; add PDP fixture + vitest
    status: pending
  - id: migration-scrape-urls
    content: "Migration 026: stores.scrape_urls TEXT[]; wire db.Store, CRUD, admin JSON"
    status: pending
  - id: scheduler-multi-url
    content: "scheduler.scrapeStore: effective URL list, loop Scrape, merge/dedupe before upsert"
    status: pending
  - id: admin-ui-seed-docs
    content: StoreManager scrape_urls field; seed Competitive Cyclist; update README/ARCHITECTURE/SCRAPING
    status: pending
isProject: false
---

# Competitive Cyclist scraping, enrichment, and multi–scrape URLs

## How might we …

Surface Competitive Cyclist sale listings (spread across `/rc/*-on-sale` pages) alongside other retailers—with PDP enrichment—in a way that matches real site mechanics and scales to other retailers that need multiple list URLs?

---

## API / network exploration (constraints)

- **What we could verify here:** A direct HTTP fetch to `https://www.competitivecyclist.com/...` from this environment returned **Backcountry’s GDPR geo-block page**, not product HTML—so automated “explore APIs” from EU-like egress is unreliable.
- **What to do next (authoritative discovery):** From a **US** browser (or US egress Runner), open a sale PLP (e.g. `…/rc/bikes-on-sale?rp=onsaleUS%3Atrue`), watch **Network** for:
  - XHR/fetch to internal **search / GraphQL / REST** endpoints (often cookie + WAF dependent).
  - Whether responses are **JSON with product arrays** usable without a browser.
- **Working hypothesis (grounded in repo):** [apps/scraper/src/parsers/backcountry.ts](apps/scraper/src/parsers/backcountry.ts) already assumes a **React PLP** with product data in **window state or large inline JSON**, uses **Playwright** with `networkidle` for **AWS WAF**, and **does not** rely on a stable public API. Competitive Cyclist is the same retail family; **expect the same class of protection**, so an unauthenticated, server-side-only JSON API may be **fragile or unavailable**. Plan for **Playwright-first**; treat any discovered JSON endpoint as an **optimization** after you have capture files (HAR) and proof it works without interactive challenges.

---

## Recommended direction

### 1) Store type and scraper registration

- Add `competitivecyclist` to [apps/scraper/src/types.ts](apps/scraper/src/types.ts) `STORE_TYPES` and Zod enums for scrape/enrich requests.
- Register parser + enricher in [apps/scraper/src/parsers/index.ts](apps/scraper/src/parsers/index.ts).
- Extend API allowlists: [apps/api/internal/api/admin.go](apps/api/internal/api/admin.go) `AllowedStoreTypes`, [apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go) `scrapeStore` store-type gate, and [apps/api/internal/db/db.go](apps/api/internal/db/db.go) `StoreTypesWithEnrichers` (reuse enrich logic alongside `backcountry` if PDP HTML matches—see §3).

### 2) Scrape implementation: reuse “Backcountry-family” extractor

Rather than copying 400 lines, refactor the **page.evaluate JSON walk + product normalization** from [apps/scraper/src/parsers/backcountry.ts](apps/scraper/src/parsers/backcountry.ts) into a small shared module (e.g. `backcountry-family.ts`) keyed by **`window.location.origin`** for relative PDP URLs:

- Today the injector hardcodes `'https://www.backcountry.com' + productUrl` when links are relative; that **must become** origin-aware (or `window.location.origin`) so the same code works for `https://www.competitivecyclist.com`.

**Behavior for CC:**

- **Pagination:** keep the existing `page` query loop (same as Backcountry parser) **per listing URL**.
- **Multiple sale URLs:** Covered in §4 (either DB-driven list or hardcoded MVP list inside the parser—but DB-driven is aligned with “generally useful”).

### 3) PDP enrichment

- Reuse [apps/scraper/src/parsers/backcountry.ts](apps/scraper/src/parsers/backcountry.ts) `enrichBackcountry` extraction path (cheerio + JSON-LD / breadcrumbs / spec tables) **if** CC PDP markup matches BC’s pattern.
- Implement as either:
  - **Shared** `enrichBackcountryFamily(url)` exported and wired as `ENRICHERS.competitivecyclist`, **or**
  - Separate export that delegates to the same helpers after verifying one real CC PDP fixture in CI.

Capture at least **one anonymized PDP HTML fixture** in `apps/scraper/src/parsers/__fixtures__/` and a thin test (Vitest), mirroring patterns used for Revel/WWC.

### 4) Multiple `scrape_url`s per store (general capability)

**Current contract:** Single column `stores.scrape_url` ([packages/shared/schema.sql](packages/shared/schema.sql)), and the scheduler calls `Scrape(ctx, store.ScrapeURL, storeType)` once ([apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go)).

**Proposed additive schema (recommended):**

- New migration `026_*` adding nullable `scrapes.urls` or **`stores.scrape_urls TEXT[]`** (name bikes `scrape_urls` plural).
- **Semantics:** Effective list =
  - if `scrape_urls` present and non-empty → use **only** that slice (explicit config), else → `[scrape_url]` for backward compatibility.
  - Optionally allow future “merge both” semantics—pick one rule and document it in [apps/api/README.md](apps/api/README.md).

**Go changes:**

- Extend [apps/api/internal/db/db.go](apps/api/internal/db/db.go) `Store` with `ScrapeURLs []string` (or `pq.StringArray`), update **`getStores`, `GetStoreByID`, `CreateStore`, `UpdateStore`** and admin handlers’ JSON structs in [apps/api/internal/api/handlers.go](apps/api/internal/api/handlers.go) to round-trip optional `scrape_urls`.
- **`scrapeStore`:** iterate effective URLs sequentially, append results, **dedupe by `(store_id, store_sku)` implicit** via existing upsert, or dedupe in memory before ingest if needed to reduce noise/logs.

**Scraper TS:** No request-schema change strictly required—keep **single-URL POST** contract; concurrency stays in the API.

**Admin UI:** [apps/web/src/admin/StoreManager.tsx](apps/web/src/admin/StoreManager.tsx) — add optional multi-line or JSON-array input mapped to `scrape_urls`; keep legacy single field for defaults.

### 5) Seed / ops

- Add `INSERT … Competitive Cyclist` row in [packages/shared/seed.sql](packages/shared/seed.sql), `store_type = competitivecyclist`, **`scrape_urls`** listing MTB-related sale routes you confirm in US (starting with bikes + bike-components URLs you gave; extend after catalog audit).
- Optional `Makefile` target `scrape-now-cc` parity with existing store-specific shortcuts (follow [Makefile](Makefile) patterns).

### 6) Documentation

Per workspace doc-sync rule, update:

- [docs/SCRAPING.md](docs/SCRAPING.md), [apps/scraper/README.md](apps/scraper/README.md) — CC store type + multi-URL behavior.
- [apps/api/README.md](apps/api/README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — scheduler / store model / admin fields.

---

## Idea-refine: assumptions to validate

- [ ] **Assumption:** CC PLPs expose the same embeddable product JSON shape as Backcountry PLPs. **Test:** US Playwright run + fixture HTML/JSON assert `hasProducts` path.
- [ ] **Assumption:** PDP HTML for specs/breadcrumbs matches Backcountry enough for shared enricher. **Test:** one fixture + enrich test.
- [ ] **Assumption:** SKUs are stable and unique per listing across multiple sale URLs. **Test:** overlap scrape of two URLs—dedupe counts.
- [ ] **Assumption:** WAF behavior is similar to Backcountry (needs `networkidle`, delays). **Test:** production-like scheduler run; watch for empty-page health alerts.

## MVP scope (first shippable slice)

- `competitivecyclist` end-to-end: scrape (Playwright) + enrich (shared or verified) + admin type + seed row with **two** sale URLs.
- DB **`scrape_urls`** + scheduler loop + admin field (small extra effort, avoids CC-only hardcoding).

## Not doing (for this effort)

- **Shopify-style** `products.json` variant backfill path for CC (not applicable unless you discover a Shopify storefront).
- **Affiliate link rewriting** unless you already have a network—leave `affiliate_network` null unless product requires it.
- **Scraper-side multi-URL POST**—unnecessary if API loops (simpler contract).

## Open questions (resolve during US-based discovery)

- Full set of **MTB-relevant** CC sale paths (apparel? protection? — curate to avoid bloating deal noise).
- Whether any internal API can replace Playwright **without** breaking on WAF—only after HAR proof.
