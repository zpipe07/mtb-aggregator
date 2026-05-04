---
name: Enrich job stale diagnosis
overview: "Deploy-time `stale` is expected (MarkStaleJobs). Your env (batch 400, default 30m job timeout, cron every 6h) combines with a likely code bug: on timeout the scheduler calls `UpdateEnrichJob(ctx, …)` with the already-cancelled job context, so pgx `Exec` can fail while errors are ignored—rows stay `running` until deploy or overlapping crons stack more orphan rows."
todos:
  - id: verify-error-string
    content: Confirm stale rows' errors include `marked stale: process restarted while job was running`
    status: completed
  - id: fix-timeout-db-update
    content: "Implemented `UpdateEnrichJobDetached` + scheduler `finalizeEnrichJob` + bulk admin finalize logging"
    status: completed
  - id: cron-overlap
    content: "Optional: single-flight / skip cron tick if enrich already running—reduces stacked jobs when goroutines outlive DB state"
    status: pending
  - id: tune-batch-timeout
    content: "Ops: raise `ENRICH_JOB_TIMEOUT` or lower `ENRICH_BATCH_SIZE` until one cron run usually finishes; align interval with worst-case duration"
    status: pending
  - id: cron-overlap
    content: "Optional: single-flight / skip cron tick if enrich already running—reduces stacked jobs when goroutines outlive DB state"
    status: pending
  - id: tune-batch-timeout
    content: "Ops: raise `ENRICH_JOB_TIMEOUT` or lower `ENRICH_BATCH_SIZE` until one cron run usually finishes; align interval with worst-case duration"
    status: pending
---

# Enrichment jobs: root cause (updated with your env)

## Your settings (recorded)

- **`ENRICH_JOB_TIMEOUT`:** unset → code default **30 minutes** ([`getEnrichJobTimeout`](apps/api/internal/scheduler/scheduler.go)).
- **`ENRICH_BATCH_SIZE`:** **400** on API (each scheduled run processes up to 400 listings per [`RunEnrichmentJob`](apps/api/internal/scheduler/scheduler.go)).
- **`ENRICH_CRON_SPEC`:** `0 */6 * * *` → **every 6 hours**.
- Scraper **1000** (if that is a separate scraper env) does not change API job-timeout semantics for enrichment; the API batch size drives how much work one enrich job attempts.

## Deploy → `stale` (unchanged)

Startup [`MarkStaleJobs`](apps/api/internal/db/db.go) marks **all** `enrich_jobs` still `running`. If you deploy while rows were never finalized, they correctly show **`stale`**.

## Primary bug hypothesis: `timed_out` never persists to Postgres

When the job deadline fires, [`RunEnrichmentJob`](apps/api/internal/scheduler/scheduler.go) does:

1. Detect `ctx.Err() != nil` (the timeout context is **already canceled**).
2. Call `_ = s.db.UpdateEnrichJob(ctx, jobID, "timed_out", …)` with that **same** `ctx`.

[`UpdateEnrichJob`](apps/api/internal/db/db.go) runs `db.pool.Exec(ctx, …)`. **pgx honors cancellation**: `Exec` typically returns **`context.Canceled`** when `ctx` is done. The return value is **discarded** (`_ =`), so the row **stays `running`**.

The goroutine then **returns**, but the DB still shows **`running`**. From the outside it looks like a **zombie job** for hours or days.

With **`ENRICH_BATCH_SIZE=400`** and **30m** wall-clock, most cron runs will **hit the timeout** before finishing all listings—so this path runs **often**, not rarely.

## Why duration grows to many hours and overlaps 6h cron

- Zombie row stays `running` until deploy.
- **Every 6 hours** cron starts **another** [`RunEnrichmentJob`](apps/api/internal/scheduler/scheduler.go) in a **new goroutine** ([robfig/cron](apps/api/internal/scheduler/scheduler.go) runs each entry in its own goroutine). That creates **another** `running` row even though the previous goroutine may have already exited.
- Elapsed “duration” in the UI is essentially **time from `started_at` until `completed_at`**—for zombies, **`completed_at` is only set when deploy runs `MarkStaleJobs`**, so you see **multi-hour** spans matching wall clock to the next deploy.

Your **Completed 400/400 ~28.8 min** row is consistent with **batch 400** finishing **under** the 30m budget when the scraper + LLM path is fast enough that day; when it is not, you hit the broken timeout update and get **`running` forever**.

## Recommended fix (implementation—when you execute the plan)

- For **any** terminal `UpdateEnrichJob` after the job `ctx` may be canceled—especially **`timed_out`**, **`failed`** after timeout, and **panic recover**—use a **detached** context, e.g. `context.WithTimeout(context.Background(), 30*time.Second)` (or Go 1.21+ [`context.WithoutCancel`](https://pkg.go.dev/context#WithoutCancel) parent + short timeout for the write).
- **Stop swallowing errors:** log and Sentry on `UpdateEnrichJob` failure so this class of bug is visible.

Apply the same pattern anywhere else that updates job status under a canceled ctx (scheduler + [`bulk_listings_admin.go`](apps/api/internal/api/bulk_listings_admin.go) if applicable).

## Operational mitigations (parallel to code fix)

- **Raise `ENRICH_JOB_TIMEOUT`** above typical worst-case for 400 listings **or** **lower `ENRICH_BATCH_SIZE`** so a single run usually **completes** and records **`completed`**—reduces timeout noise (but **fix the DB write on timeout** regardless).
- **Single-flight enrich** (skip cron if a job is already `running`, or Postgres advisory lock): avoids piling up duplicate goroutines and `running` rows when zombies exist.

## Verification

- Reproduce locally: `ENRICH_BATCH_SIZE=400`, short `ENRICH_JOB_TIMEOUT=1ns` or `1m`, trigger enrich—confirm row remains `running` **before** code fix and **`timed_out` after** fix.
- Stale rows should still show `marked stale: process restarted…` after deploy; that part remains expected.
