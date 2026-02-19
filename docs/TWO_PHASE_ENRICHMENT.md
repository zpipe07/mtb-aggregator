# Two-Phase Enrichment Architecture

For data that requires visiting product detail pages (PDPs)—e.g. full category breadcrumb, specs, description—use a two-phase approach instead of enriching during the main scrape.

## Phase 1: Listing Scrape (Current)

- Scrapes listing pages only (e.g. clearance, sale)
- Extracts: name, price, URL, image, brand, category (from listing JSON when available)
- Fast, low risk of rate limiting
- Runs on cron (e.g. every 4 hours)

## Phase 2: PDP Enrichment (Implemented)

- Separate job that visits product detail pages
- Extracts: category from breadcrumbs (JensonUSA)
- Runs nightly at 2am (`ENRICH_CRON_SPEC`) or on-demand via `POST /enrich-now`
- Batch size: 50 per run; re-enriches listings older than 7 days

### Design Considerations

**1. Schema**

- Add `last_enriched_at TIMESTAMP` to `store_listings` to track when a listing was last enriched
- Add new columns for PDP-only fields (e.g. `description TEXT`, `specs JSONB`)

**2. Enrichment Job**

- New endpoint: `POST /enrich` or `POST /enrich-now` (similar to `/scrape-now`)
- Selects listings where `last_enriched_at IS NULL` or `last_enriched_at < NOW() - interval '7 days'`
- Limits batch size (e.g. 50 per run) to avoid long runs
- For each listing: navigate to `product_url`, extract, update DB

**3. Scraper Changes**

- New parser: `enrichJensonUSAPage(url: string)` that visits a single PDP and returns enriched data
- Or: extend existing parser to accept "mode: listing | detail" and return different shapes

**4. Rate Limiting**

- 3–10 second delay between PDP visits
- Sequential or low concurrency (2–3)
- Consider `PROXY_URL` if blocked

**5. Partial Success**

- If one PDP fails, log and continue; don’t fail the whole batch
- Store `last_enriched_at` only on success

### Current Implementation

- **Schema:** `last_enriched_at`, `category` on `store_listings`
- **Scraper:** `POST /enrich` with `{ url, store }` — extracts breadcrumb category
- **API:** `POST /enrich-now`; enrichment cron at 2am
- **Breadcrumb selectors:** `nav[aria-label="Breadcrumb"]`, `.breadcrumb`, JSON-LD BreadcrumbList
