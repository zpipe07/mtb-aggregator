# Targeted re-enrichment and re-classify

## Re-classify without re-scraping (validated)

`runLLMCategoryClassification` in `apps/api/internal/api/handlers.go` loads the listing with `GetListingForCategoryClassification`, which reads `product_name`, `metadata`, and `category_path` from `store_listings` only. It does **not** require a prior PDP call in the same request; it uses whatever description/specs are already in `metadata` and the retailer's `category_path` array.

**Implication:** Re-classify-only operations are safe to run on listings that were enriched in the past (or that have enough metadata from scrape) without re-fetching the PDP, as long as `metadata` / `category_path` are present enough for the LLM.

## `llm_confidence` coverage (operator SQL)

To see how many listings have a top-level `llm_confidence` in `metadata` (used by filters and bulk re-classify confidence thresholds), run against production or local DB:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE metadata ? 'llm_confidence') AS with_confidence
FROM store_listings;
```

If `with_confidence` is a small fraction of `total`, confidence-band targeting will only apply to that subset until more listings are classified.

## Admin limits

- `ADMIN_BULK_MAX_LISTINGS` (default `5000`) caps bulk classify and bulk re-enrich via `POST /admin/listings/bulk-classify` and `POST /admin/listings/bulk-enrich`.
- `POST /admin/category-classifier/run` uses the same cap when the filter matches more than the max (HTTP 400 with message).

## Dev proxy timeout (~30s) and async bulk

Next.js dev rewrites (`/api` → `http://localhost:8080`) effectively act as a proxy. If the Go handler holds the connection open longer than that limit, the proxy can close the socket; the API’s `r.Context()` is then cancelled, which surfaces as `context canceled` on the next downstream call (e.g. LLM) and “socket hang up” on the client.

<<<<<<< HEAD
**Bulk classify, bulk re-enrich, and** `POST /admin/category-classifier/run` **(Category Classifier manager + Operations “Re-classify only”)** return **202 Accepted** when there is work to do, with `{ "async": true, "job_id": N }`, and run the classify loop in a background goroutine using a **detached** context (`context.Background()` + `BULK_LISTINGS_WORK_TIMEOUT`). The sync path (same handler) is only used when zero listings match. Poll `GET /admin/enrich-jobs/:id` or use the Data browser / Operations job UI for progress.
=======
**Bulk classify and bulk re-enrich** return **202 Accepted** immediately with `{ "async": true, "job_id": N }` and run work in a background goroutine using a **detached** context (`context.Background()` + `BULK_LISTINGS_WORK_TIMEOUT`). Poll `GET /admin/enrich-jobs/:id` or use the Data browser / Operations job UI for progress.
>>>>>>> @{-1}

Background work timeout: `BULK_LISTINGS_WORK_TIMEOUT` (Go duration, default `2h`).

## Migration

- `024_enrich_job_type.sql` adds `enrich_jobs.job_type` (`enrich`, `classify`, …) for job history in Operations.
