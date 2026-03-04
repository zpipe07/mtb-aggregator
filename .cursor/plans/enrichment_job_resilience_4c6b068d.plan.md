---
name: Job Resilience
overview: Add timeout, recovery, stale-job cleanup, and admin cancellation to both scrape and enrichment jobs to prevent them from being stuck as "running" indefinitely, while preserving partial progress.
todos:
  - id: stale-cleanup
    content: Add MarkStaleJobs DB method (covers both scrape_jobs and enrich_jobs) and call it on API startup in main.go to mark orphaned 'running' jobs as 'stale'
    status: completed
  - id: scraper-context
    content: Update scraper Client.Scrape and Client.Enrich to accept a context.Context so HTTP calls respect timeouts (use http.NewRequestWithContext)
    status: completed
  - id: enrich-timeout-recovery
    content: Add context.WithTimeout and defer/recover to RunEnrichmentJob and RunEnrichmentJobForStore; check ctx.Err() between listings; save partial progress as 'timed_out' on timeout and 'failed' on panic
    status: completed
  - id: scrape-timeout-recovery
    content: Add context.WithTimeout and defer/recover to scrapeStore; pass context to Scrape call; save partial progress as 'timed_out' on timeout and 'failed' on panic
    status: completed
  - id: admin-cancel-backend
    content: Add POST /admin/jobs/:id/cancel and POST /admin/enrich-jobs/:id/cancel endpoints that set status='cancelled' for running jobs; add CancelScrapeJob and CancelEnrichJob DB methods
    status: completed
  - id: admin-cancel-frontend
    content: Add 'Mark Stale' button to both scrape and enrich job detail modals in Operations.tsx (visible only for running jobs); add mutations, API functions, and update statusColor for new statuses
    status: completed
isProject: false
---

# Job Resilience (Scrape + Enrichment)

## Problem

Both `scrape_jobs` and `enrich_jobs` get stuck with `status='running'` forever when the API process crashes, restarts, or the hosting platform kills the long-running HTTP request. There is no timeout, no recovery, and no way to clean up stuck jobs. Both job types have the identical vulnerability.

**Key files involved:**

- [apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go) -- `RunScrapeJob`/`scrapeStore` and `RunEnrichmentJob`/`RunEnrichmentJobForStore`
- [apps/api/internal/db/db.go](apps/api/internal/db/db.go) -- `CreateScrapeJob`, `UpdateScrapeJob`, `CreateEnrichJob`, `UpdateEnrichJob`
- [apps/api/main.go](apps/api/main.go) -- HTTP handlers for `POST /scrape-now` and `POST /enrich-now`
- [apps/api/internal/scraper/client.go](apps/api/internal/scraper/client.go) -- scraper HTTP client (15min timeout per request, no context support)
- [apps/web/src/admin/Operations.tsx](apps/web/src/admin/Operations.tsx) -- admin UI with both job history tables
- [apps/web/src/admin/api.ts](apps/web/src/admin/api.ts) -- admin API functions and types
- [apps/web/src/admin/hooks/mutations.ts](apps/web/src/admin/hooks/mutations.ts) -- admin mutations

**Schemas (no migration needed -- `VARCHAR(20)` accommodates new status values):**

- [packages/shared/migrations/008_scrape_jobs.sql](packages/shared/migrations/008_scrape_jobs.sql)
- [packages/shared/migrations/010_enrich_jobs.sql](packages/shared/migrations/010_enrich_jobs.sql)

## Partial Data Is Already Safe

Both job types save data incrementally per-listing inside their processing loops (`UpsertListing`/`InsertPriceHistory` for scrape, `UpdateListingEnrichment` for enrich). Listings processed before a crash/timeout already have their data saved. The only thing lost is the final job-level status update. All solutions below preserve this and additionally save partial job-level progress on timeout.

---

## Solution

### 1. Startup Stale Job Cleanup

On API boot in [main.go](apps/api/main.go), mark any jobs still in `status='running'` as `'stale'`. If the process restarted, those jobs are guaranteed dead.

**DB layer** -- add to [db.go](apps/api/internal/db/db.go):

```go
func (db *DB) MarkStaleJobs(ctx context.Context) error {
    _, err := db.pool.Exec(ctx, `
        UPDATE enrich_jobs
        SET status = 'stale', completed_at = NOW(),
            errors = array_append(COALESCE(errors, '{}'),
                'marked stale: process restarted while job was running')
        WHERE status = 'running'
    `)
    if err != nil {
        return err
    }
    _, err = db.pool.Exec(ctx, `
        UPDATE scrape_jobs
        SET status = 'stale', completed_at = NOW(),
            errors = array_append(COALESCE(errors, '{}'),
                'marked stale: process restarted while job was running')
        WHERE status = 'running'
    `)
    return err
}
```

Call early in `main()`, after DB init but before scheduler starts.

### 2. Context-Aware Scraper Client

Update [scraper/client.go](apps/api/internal/scraper/client.go) so both `Scrape` and `Enrich` accept a `context.Context` parameter and use `http.NewRequestWithContext` instead of `httpClient.Post`. This allows job-level timeouts to cancel in-flight HTTP calls.

```go
func (c *Client) Enrich(ctx context.Context, productURL, store string) (*EnrichResult, error) {
    // ...
    req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/enrich", bytes.NewReader(jsonBody))
    // ...
}

func (c *Client) Scrape(ctx context.Context, url, store string) ([]ScrapeResult, error) {
    // same pattern
}
```

Update all call sites in scheduler.go to pass `ctx`.

### 3. Enrichment Job: Timeout + Panic Recovery

In [scheduler.go](apps/api/internal/scheduler/scheduler.go), for both `RunEnrichmentJob` and `RunEnrichmentJobForStore`:

- **Timeout**: Configurable via `ENRICH_JOB_TIMEOUT` env var (default 30 minutes). Use `context.WithTimeout`. Check `ctx.Err()` between listings and between batches. On timeout, break out and save partial results with `status='timed_out'`.
- **Panic recovery**: `defer func() { recover(); update job as failed with partial counts }()` placed after `jobID` is created so partial progress is always saved.

### 4. Scrape Job: Timeout + Panic Recovery

Same pattern for `scrapeStore`:

- **Timeout**: Configurable via `SCRAPE_JOB_TIMEOUT` env var (default 20 minutes). Wrap in `context.WithTimeout`. The `Scrape()` HTTP call will respect the context. If timeout hits during the scrape HTTP call, it returns an error. If it hits during the upsert loop, check `ctx.Err()` between listings. Save partial counts with `status='timed_out'`.
- **Panic recovery**: Same defer/recover pattern, calling `UpdateScrapeJob` with partial `found`/`upserted` counts.

Note: scrape jobs differ slightly from enrich jobs -- the single `Scrape()` HTTP call is the long part (can be 10+ minutes), and the upsert loop after it is fast. So the timeout primarily gates the scrape call itself. Partial data: if the HTTP call completes but timeout fires during upserts, the listings already upserted are saved.

### 5. Admin Cancel Endpoint + UI

**Backend** -- two new endpoints in [handlers.go](apps/api/internal/api/handlers.go):

- `POST /admin/jobs/:id/cancel` -- sets `status='cancelled'`, `completed_at=NOW()` on `scrape_jobs` where `status='running'`
- `POST /admin/enrich-jobs/:id/cancel` -- same for `enrich_jobs`

Add `CancelScrapeJob` and `CancelEnrichJob` methods to [db.go](apps/api/internal/db/db.go).

**Frontend** -- in [Operations.tsx](apps/web/src/admin/Operations.tsx):

- Add a "Mark Stale" button in both the scrape job detail modal and the enrich job detail modal, visible only when `status === 'running'`.
- Add `cancelScrapeJob` and `cancelEnrichJob` functions in [api.ts](apps/web/src/admin/api.ts).
- Add `useCancelScrapeJob` and `useCancelEnrichJob` mutations in [mutations.ts](apps/web/src/admin/hooks/mutations.ts) that invalidate the respective job list queries on success.
- Update `statusColor()` to handle `'stale'`, `'timed_out'`, and `'cancelled'` (use distinct colors: stale=stone/gray, timed_out=amber, cancelled=amber).

---

## New Status Values

Current: `running`, `completed`, `failed`

New (both tables): `stale` (process died), `timed_out` (hit max duration), `cancelled` (manual admin action)

No migration needed -- both tables use `VARCHAR(20)` for `status`, which already accommodates the new values.
