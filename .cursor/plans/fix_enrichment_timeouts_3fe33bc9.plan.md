---
name: Fix Enrichment Timeouts
overview: Fix enrichment job timeouts by removing Competitive Cyclist from PDP enrichment (all calls are WAF-blocked) and adding a per-job listing cap so ENRICH_BATCH_SIZE semantics are clearer and jobs stay bounded.
todos:
  - id: remove-cc-enricher
    content: Remove `competitivecyclist` from `StoreTypesWithEnrichers` in `db.go`
    status: completed
  - id: add-max-listings-cap
    content: Add `ENRICH_MAX_LISTINGS` env var and per-job cap logic in `scheduler.go`
    status: completed
  - id: update-docs
    content: Update README, CLAUDE.md, and ARCHITECTURE.md for CC removal and new env var
    status: completed
  - id: verify-openai-key
    content: Verify `OPENAI_API_KEY` is present on Render API service env vars
    status: completed
isProject: false
---

# Fix Enrichment Job Timeouts

## Root Cause Summary (from Render logs)

Three compounding issues cause every enrichment job to time out:

1. **CC WAF blocks 100% of PDP enrichments** -- Every CC PDP call returns 9,925 bytes of WAF challenge page (`waf_suspect=true`), takes ~126 seconds per listing, and returns empty/degraded data. The scraper's `SCRAPER_STORAGE_STATE` cookies are expired/missing.
2. **`ENRICH_BATCH_SIZE` is per-batch, not per-job** -- The `runEnrichmentLoop` in [`scheduler.go`](apps/api/internal/scheduler/scheduler.go) fetches batches of 100 in a loop until the backlog is empty or the 4-hour timeout hits. Jobs regularly process 115-236 listings before timing out.
3. **OpenAI quota genuinely exhausted** -- The API returns `insufficient_quota` (billing error, not rate limit). User says credits were recently added; this should self-resolve. Verify the `OPENAI_API_KEY` env var on Render matches the funded org.

## Changes

### 1. Remove `competitivecyclist` from `StoreTypesWithEnrichers`

**File:** [`apps/api/internal/db/db.go`](apps/api/internal/db/db.go) line 1516

Remove `"competitivecyclist"` from the `StoreTypesWithEnrichers` slice. CC ingest is Impact catalog (API-side), and PDP enrichment is entirely WAF-blocked. This immediately stops the enrichment loop from wasting ~2 min/listing on hundreds of CC SKUs.

```go
var StoreTypesWithEnrichers = []string{"jensonusa", "worldwidecyclery", "revelbikes", "backcountry", "ridebicycles", "thundermountainbikes", "mackcycle", "canyon", "specialized", "trek", "universalcycles", "n1bikes"}
```

Note: The CC enricher/parser stays registered in the scraper for manual/debug use; only the automatic enrichment loop skips CC.

### 2. Add `ENRICH_MAX_LISTINGS` per-job cap

**File:** [`apps/api/internal/scheduler/scheduler.go`](apps/api/internal/scheduler/scheduler.go)

- Add a new env-var reader `getEnrichMaxListings()` (returns 0 = unlimited by default, or the configured cap)
- In `runEnrichmentLoop`, after processing each batch, check if `totalProcessed >= maxListings` and break if so
- This gives explicit control: set `ENRICH_MAX_LISTINGS=100` to guarantee a job never processes more than 100 listings total, regardless of how many batches the loop would otherwise pull

Key code location -- the loop break condition at line 609:

```go
if len(listings) < batchSize {
    break
}
```

Add before this:

```go
if maxListings > 0 && totalProcessed >= maxListings {
    enrichmentLog.Info("reached per-job listing cap", "scope", scope, "cap", maxListings, "processed", totalProcessed)
    break
}
```

### 3. Update docs

- [`apps/api/README.md`](apps/api/README.md) -- Remove `competitivecyclist` from the `StoreTypesWithEnrichers` list in the enrich-now docs; document `ENRICH_MAX_LISTINGS`
- [`CLAUDE.md`](CLAUDE.md) -- Add `ENRICH_MAX_LISTINGS` to env var docs; note CC removed from enrichers
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) -- Update enrichment data flow if it mentions CC PDP enrichment

### 4. (Verify) OpenAI API key on Render

Not a code change -- use the Render MCP to check `OPENAI_API_KEY` is set on the API service. If the key belongs to a different org than where credits were added, the quota error will persist. The key itself won't be visible, but its presence can be confirmed.

## What this does NOT change

- CC scrape ingest (Impact catalog) -- unaffected
- CC variant fan-out logic -- still present for manual/debug enrichment
- The 4-hour job timeout -- stays as-is; jobs should now complete well within it
- The enrichment loop structure -- still batched; the cap just adds an upper bound
