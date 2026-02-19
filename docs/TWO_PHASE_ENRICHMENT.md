# Two-Phase Enrichment Architecture

For data that requires visiting product detail pages (PDPs)—e.g. full category breadcrumb, specs, description—use a two-phase approach instead of enriching during the main scrape.

## Phase 1: Listing Scrape (Current)

- Scrapes listing pages only (e.g. clearance, sale)
- Extracts: name, price, URL, image, brand, category (from listing JSON when available)
- Fast, low risk of rate limiting
- Runs on cron (e.g. every 4 hours)

## Phase 2: PDP Enrichment (Future)

- Separate job that visits product detail pages
- Extracts: full category, specs, description, or other PDP-only data
- Runs on a different schedule (e.g. nightly) or on-demand

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

### Implementation Order

1. Add `last_enriched_at` and PDP columns to schema
2. Add `enrichJensonUSAPage` (or equivalent) to scraper
3. Add enrichment job to Go scheduler (or separate cron)
4. Add `POST /enrich-now` for manual trigger
5. Extend API and frontend to expose enriched fields
