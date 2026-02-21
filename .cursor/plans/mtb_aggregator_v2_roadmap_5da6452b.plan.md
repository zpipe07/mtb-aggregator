---
name: MTB Aggregator V2 Roadmap
overview: A phased plan to transform the MTB deal aggregator from a single-source MVP into the best resource for shopping for mountain bike products, focusing on source diversity, full-text search, MTB-specific taxonomy, price history, and SEO.
todos:
  - id: phase-1-search
    content: "Phase 1: Add full-text search (tsvector + GIN index), server-side sort/pagination, search bar UI"
    status: pending
  - id: phase-2-infra
    content: "Phase 2 prep: Hybrid scraper infra -- add cheerio, create shared browser.ts utility for Browserbase remote browser, refactor JensonUSA to use remote browser"
    status: pending
  - id: phase-2-backcountry
    content: "Phase 2a: Backcountry parser + seed data"
    status: pending
  - id: phase-2-chainreaction
    content: "Phase 2b: Chain Reaction Cycles parser + seed data"
    status: pending
  - id: phase-2-rei
    content: "Phase 2c: REI Outlet parser + seed data"
    status: pending
  - id: phase-2-worldwide
    content: "Phase 2d: Worldwide Cyclery parser + seed data + scraper health monitoring"
    status: pending
  - id: phase-3-data-quality
    content: "Phase 3: Brand normalization, MTB taxonomy, product name metadata extraction, faceted filter UI"
    status: pending
  - id: phase-4-price-history
    content: "Phase 4: Price history API endpoint + chart visualization on deal detail page"
    status: pending
  - id: phase-5-nextjs-seo
    content: "Phase 5: Migrate frontend to Next.js for SSR, add structured data, sitemap, SEO meta tags"
    status: pending
  - id: phase-6-alerts
    content: "Phase 6 (future): Saved searches + price drop email alerts"
    status: pending
isProject: false
---

# MTB Aggregator V2 Roadmap

## Current State

- 1 scraper (JensonUSA clearance), strategy-pattern parser architecture in [apps/scraper/src/parsers/index.ts](apps/scraper/src/parsers/index.ts)
- Go API with basic filtering (store, brand, category, min_discount) in [apps/api/internal/db/db.go](apps/api/internal/db/db.go)
- React + Vite SPA with dropdowns and client-side sorting in [apps/web/src/App.tsx](apps/web/src/App.tsx)
- PostgreSQL schema with `store_listings`, `price_history`, `stores` tables in [packages/shared/schema.sql](packages/shared/schema.sql)
- No full-text search, no price history UI, no SSR/SEO

---

## Phase 1: Full-Text Search + Server-Side Sort/Pagination

**Goal:** People can type "fox 36 kashima" and find what they're looking for. This is the single highest-impact UX improvement.

### Database

- Add `search_vector tsvector` column to `store_listings`
- Add GIN index: `CREATE INDEX idx_store_listings_search ON store_listings USING GIN(search_vector)`
- Add trigger to auto-populate on INSERT/UPDATE from `product_name`, `brand`, and the last element of `category_path`
- Backfill existing rows
- Migration file: `packages/shared/migrations/003_full_text_search.sql`

### Go API ([apps/api/internal/db/db.go](apps/api/internal/db/db.go))

- Add `Search string` field to `GetDealsParams`
- When `?q=` is present, add `search_vector @@ plainto_tsquery('english', $N)` to the WHERE clause, and rank results by `ts_rank(search_vector, query)` instead of `last_scraped DESC`
- Move sorting to server-side: add `?sort=` param (`newest`, `discount`, `price_asc`, `price_desc`, `relevance`) to the API, build `ORDER BY` clause in Go
- Add `total_count` to the response (via `COUNT(*) OVER()` window function) so the frontend can show pagination

### Frontend ([apps/web/src/](apps/web/src/))

- Add a prominent search bar above the filter row (debounced, ~300ms)
- Pass `q` param through to API via [apps/web/src/api.ts](apps/web/src/api.ts)
- Remove client-side sorting logic from `App.tsx`; let API handle it via `?sort=`
- Add pagination controls (prev/next or infinite scroll) using `total_count`
- Show result count ("142 deals found")

---

## Phase 2: Source Diversity -- Add 3-4 Scrapers

**Goal:** Enough sources that users come here instead of visiting each store. Target 4-5 total stores.

### Scraper Infrastructure: Hybrid Approach

The Render free tier (512MB) cannot support multiple concurrent Playwright/Chromium instances. Instead of migrating platforms, use a hybrid scraping strategy:

- **Lightweight parsers (cheerio + fetch):** For sites that serve product data in the initial HTML response or embed JSON in `<script>` tags. No Chromium needed, ~10MB memory per scrape. Likely candidates: REI, Chain Reaction Cycles, Worldwide Cyclery (Shopify stores serve JSON at `.json` URL variants).
- **Remote browser (Browserbase/Browserless):** For sites that require JS rendering (like JensonUSA). Instead of `chromium.launch()`, use `playwright.connect(browserWSEndpoint)` to connect to a managed remote browser. The scraper process stays lightweight (~~50MB), Chromium runs on their infrastructure. Free tiers available (~~100 sessions/month on Browserbase).
- **Refactor existing JensonUSA parser** to use the remote browser approach so the scraper service itself never launches Chromium locally.

Implementation in [apps/scraper/src/parsers/](apps/scraper/src/parsers/):

- Add `cheerio` as a dependency for lightweight HTML parsing
- Create a shared browser utility (`src/browser.ts`) that connects to Browserbase via `BROWSER_WS_ENDPOINT` env var, falling back to local `chromium.launch()` for local dev
- Each parser declares its scraping mode: `"http"` (cheerio) or `"browser"` (Playwright remote)

### New Parsers

Each parser follows the existing pattern: export a `scrape[Store]` function returning `ScrapeResult[]` and an `enrich[Store]` function returning `EnrichResult`, then register in [apps/scraper/src/parsers/index.ts](apps/scraper/src/parsers/index.ts).

- **Backcountry** (`backcountry.ts`) -- already stubbed in types. Target `https://www.backcountry.com/cycling/mountain-biking` + sale section. Large catalog, good metadata. Assess: likely needs browser (React SPA).
- **Chain Reaction Cycles** (`chainreaction.ts`) -- `https://www.chainreactioncycles.com/clearance/cycling`. UK-based, massive MTB selection, frequent deep discounts. Assess: likely HTTP-friendly (server-rendered). Prices in GBP (store in original currency, add `currency` column or normalize to USD).
- **REI Outlet** (`rei.ts`) -- `https://www.rei.com/rei-garage/c/cycling`. Trusted US retailer. Assess: server-rendered HTML, likely HTTP-friendly.
- **Worldwide Cyclery** (`worldwide.ts`) -- `https://www.worldwidecyclery.com/collections/sale`. Shopify store, supports `.json` URL variant for direct JSON access. Definitely HTTP-friendly.

### Database Changes

- Seed new stores in `packages/shared/seed.sql`
- Consider adding `currency VARCHAR(3) DEFAULT 'USD'` to `store_listings` if including international stores
- Update enrichment query in `db.go` to remove the `s.store_type = 'jensonusa'` filter so new store types get enriched

### Operational

- Add fixture HTML/JSON for each parser for testing (save a sample response, write parser tests against it)
- Add scraper health monitoring: if a store returns 0 results for 2+ consecutive scrapes, flag it (likely selector breakage)

---

## Phase 3: Data Quality + MTB Taxonomy

**Goal:** Clean, normalized data that powers precise filtering. This is the "invisible infrastructure" that makes the browsing experience feel professional.

### Brand Normalization

- Create a brand alias mapping (e.g., `"sram" -> "SRAM"`, `"shimano" -> "Shimano"`, `"rock shox" -> "RockShox"`) as a JSON config or DB table
- Apply during scrape ingestion in the Go scheduler before upserting
- Backfill existing data

### MTB Category Taxonomy

- Define a canonical category tree (stored as a reference table or config):
  - Bikes > Mountain > Trail, Enduro, XC, Downhill, Dirt Jump
  - Components > Drivetrain, Brakes, Suspension, Wheels, Cockpit
  - Gear > Helmets, Protection, Clothing, Shoes
  - Accessories > Tools, Bags, Lights
- Map each store's raw `category_path` to the canonical taxonomy during enrichment
- Add a `canonical_category` column (or reuse `category_path` with normalized values)

### Product Name Metadata Extraction

- Parse product names for structured attributes using regex patterns:
  - Wheel size: `29`, `27.5`, `26`, `29er`, `mullet`
  - Suspension travel: `150mm`, `160mm`
  - Model year: `2024`, `2025`
  - Groupset: `XT`, `XTR`, `GX Eagle`, `X01`
- Store as a `metadata JSONB` column on `store_listings`
- Expose as filterable facets in the API

### Frontend Faceted Filters

- Replace simple dropdowns with grouped/hierarchical category browser
- Add MTB-specific filter chips (wheel size, component type)
- Show active filter count and "clear all" affordance

---

## Phase 4: Price History Visualization

**Goal:** Show users whether a deal is actually good, build trust, and create a "CamelCamelCamel for bikes" habit.

### API

- Add `GET /deals/:id/price-history` endpoint returning `[{price, recorded_at}]` from the existing `price_history` table
- Include `lowest_price`, `highest_price`, `avg_price` summary stats

### Frontend

- Add a deal detail page/modal (click a DealCard to expand)
- Add a price history chart (use `recharts` or `chart.js`) showing price over time
- Show "lowest ever" / "X% below average" badges on cards when applicable
- Add "price dropped" indicator when the current scrape found a lower price than the previous one

---

## Phase 5: SEO -- Next.js Migration

**Goal:** Organic search is the growth engine. A client-side SPA is invisible to Google. Move to Next.js for SSR.

### Migration

- Replace `apps/web` (Vite + React) with Next.js (App Router)
- Reuse all existing components (DealCard, DealFilters, etc.) -- they're already plain React
- Server Components for the deals list page (fetch data server-side)
- URL structure: `/deals` (browse), `/deals/[id]/[slug]` (individual deal), `/brands/[brand]`, `/categories/[category]`

### SEO Specifics

- Add JSON-LD structured data (`Product` schema) on deal detail pages
- Generate `sitemap.xml` dynamically from the deals database
- Add `<meta>` tags (title, description, og:image) per page
- Set proper canonical URLs

### API Adjustment

- The Go API remains as-is (backend for data)
- Next.js server components call the Go API directly (server-to-server, no CORS needed)

---

## Phase 6: Alerts + Saved Searches (Future)

**Goal:** Recurring engagement. Deferred until search and sources are solid.

- Simple email-based registration (no passwords -- magic link or just email + token)
- Save search criteria (query, filters, max price threshold)
- Daily digest: check saved searches against new/changed listings, send email if matches
- Price drop alerts: "notify me when this item drops below $X"

---

## Implementation Priority

```mermaid
gantt
    title Implementation Phases
    dateFormat YYYY-MM-DD
    section Phase1
    Full-text search + sort/pagination :p1, 2026-02-22, 3d
    section Phase2
    Backcountry parser                 :p2a, after p1, 2d
    Chain Reaction parser              :p2b, after p2a, 2d
    REI Outlet parser                  :p2c, after p2a, 2d
    Worldwide Cyclery parser           :p2d, after p2b, 2d
    section Phase3
    Brand normalization                :p3a, after p2d, 1d
    MTB taxonomy + metadata extraction :p3b, after p3a, 3d
    Faceted filters UI                 :p3c, after p3b, 2d
    section Phase4
    Price history API + chart UI       :p4, after p3c, 2d
    section Phase5
    Next.js migration + SEO            :p5, after p4, 5d
```

Phases 1-2 are where the most value is concentrated. A usable search bar and 4-5 stores would already make this meaningfully useful to MTB shoppers. Phases 3-4 make it _great_. Phase 5 makes it _discoverable_. Phase 6 makes it _sticky_.
