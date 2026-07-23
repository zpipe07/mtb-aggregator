---
name: Durable enrichment pipeline
overview: Make enrichment per-step durable, retryable, and observable using Postgres state — PDP snapshots, a per-listing step-state table, and an event ledger — instead of introducing a queue system.
todos:
  - id: validate-assumptions
    content: Validate hash stability, LLM input sufficiency, and profile versioning (the 4 assumption checks)
    status: completed
  - id: contracts
    content: "Define enrichstate package contracts: domain types, step enum, StateStore/SnapshotStore/EventRecorder interfaces, admin endpoint shapes"
    status: completed
  - id: core-logic-tdd
    content: "TDD pure core: normalization+hashing, step transitions, backoff, LLM skip decision (failing tests first)"
    status: completed
  - id: migration
    content: "Migration: listing_enrichment state table, pdp_snapshots, enrichment_events + tested backfill from last_enriched_at"
    status: completed
  - id: refactor-loop
    content: Refactor runEnrichmentLoop into 3 passes over the interfaces; orchestration tests with in-memory fakes
    status: completed
  - id: admin-surface
    content: "Admin: per-step metrics + confidence distribution + idempotent retry-step endpoint (httptest coverage); wire into Operations/Insights"
    status: completed
  - id: verify
    content: gofmt, go vet ./..., go test -race ./... clean; end-to-end enrich-now run against local stack
    status: completed
  - id: docs
    content: Update apps/api/README.md, docs/ARCHITECTURE.md, packages/shared/migrations/README.md, CLAUDE.md
    status: completed
isProject: false
---

# Durable Enrichment Pipeline (No Queue)

## Problem Statement

How might we make each listing's enrichment (PDP fetch → LLM classify → LLM spec extract) individually durable, observable, and retryable — instead of an opaque, all-or-nothing 4-hour sequential job?

## Recommended Direction

Keep the existing in-process scheduler loop, but split it into three passes driven by durable per-step state in Postgres. No queue library, no Redis, no worker service. The three stages already exist as distinct code steps in [apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go) and [apps/api/internal/llmlisting/pipeline.go](apps/api/internal/llmlisting/pipeline.go) — they're just fused with no per-step state. The "queue" becomes selection queries over a state table, which is a finer-grained version of what `GetListingsNeedingEnrichmentForFilter` already does.

Three pieces:

1. **PDP snapshots** — persist the scraper's parsed `EnrichResult` payload (category_path, raw_specs, description, variants) with a normalized content hash. Latest-only per listing. LLM steps read from the snapshot, so classify/extract can be retried or re-run anytime without a ~1–2 min Playwright refetch, and an unchanged hash lets the LLM steps be skipped entirely.

2. **Per-step state** — new 1:1 table `listing_enrichment` (avoids widening `store_listings`): `pdp_fetched_at`, `pdp_hash`, `pdp_attempts`, `pdp_error`, `next_pdp_attempt_at`, `classified_at`, `classify_attempts`, `classify_error`, `llm_confidence`, `prompt_profile_version`, `extracted_at`, `extract_attempts`, `extract_error`, `next_llm_attempt_at`. The enrich job becomes three passes (PDP pass, classify pass, extract pass), each committing state per listing. Crash recovery is free: state is already committed; the next run picks up wherever each listing is stuck. Failed steps get exponential backoff via `next_*_attempt_at` and a terminal `dead` status after N attempts.

3. **Event ledger** — append-only `enrichment_events(listing_id, step, status, error, model, confidence, duration_ms, job_id, created_at)`. Powers the accuracy monitoring you asked for: per-step success rates over time, confidence distributions, and a low-confidence listing list. The classifier already produces confidence (the `llm_confidence_below` filter exists); it's just not stored or surfaced.

Invalidation rules:

- PDP refetch: existing 7-day staleness (unchanged behavior)
- LLM re-run: PDP hash changed OR the listing's prompt profile version changed since last run OR forced
- `FORCE=1` and `requeue-wiped-enrichment` semantics map onto clearing step state

## Key Assumptions to Validate

- [ ] Parsed PDP payloads hash stably across fetches — test by double-fetching a few listings per store and diffing normalized payloads (sorted keys, volatile fields stripped)
- [ ] `EnrichResult` + listing fields (title, brand) are sufficient input for classify/extract without refetch — audit `ClassificationStep`/`SpecExtractionStep` inputs in [apps/api/internal/llmlisting/pipeline.go](apps/api/internal/llmlisting/pipeline.go)
- [ ] Prompt profiles can carry a version/updated_at usable as an invalidation stamp — check `llm_prompt_profiles` schema
- [ ] Snapshot storage is acceptable: a few KB JSONB × listings count in Neon (payloads are parsed data, not raw HTML)

## MVP Scope

- Migration: `listing_enrichment` state table, `pdp_snapshots` (or snapshot columns on the state table), `enrichment_events`
- Refactor `runEnrichmentLoop` into three passes with per-step selection queries, backoff, and attempt caps; LLM passes read snapshots
- Skip-unchanged logic (hash + profile version)
- Backfill: seed state table from existing `last_enriched_at` / metadata so nothing re-enriches unnecessarily on rollout
- Admin: per-step metrics endpoint (success rates, backlog per step, confidence distribution) surfaced on Operations/Insights; per-listing "retry step" action (clears step state)
- Keep `enrich_jobs` as the job-level wrapper/history — unchanged for continuity

## Engineering Approach

### Contracts first (interface design)

Define the interfaces and types before any implementation, in a new package (e.g. `apps/api/internal/enrichstate/`):

- **Domain types**: `StepState` (per-step timestamps, attempts, error, next-attempt), `Snapshot` (payload + hash + fetched-at), `Event` (step, status, model, confidence, duration). Input/output structs are separate from DB row structs; step names are a typed enum (`StepPDP`, `StepClassify`, `StepExtract`), not raw strings.
- **Small consumer-defined interfaces** so the pipeline is testable without a DB:
  - `StateStore` — `ClaimForStep(ctx, step, limit) ([]Item, error)`, `RecordStepResult(ctx, ...)`, `ResetStep(ctx, listingID, step)`
  - `SnapshotStore` — `SaveSnapshot(ctx, ...)`, `GetSnapshot(ctx, listingID)`
  - `EventRecorder` — `Record(ctx, Event)`
  - The existing `*db.DB` implements these; the pipeline depends only on the interfaces (mirrors how `llmlisting.Pipeline` already takes narrow deps).
- **Admin API contracts defined before handlers**: `GET /admin/metrics/enrichment-steps` (per-step backlog, success rates, confidence histogram — paginated where list-shaped) and `POST /admin/listings/{id}/enrichment/retry?step=` (idempotent: resetting an already-pending step is a no-op). Same error envelope and Bearer auth as existing `/admin/*` handlers. All changes to `/enrich-now` params are additive and optional; `enrich_jobs` shape is unchanged (Hyrum's Law — the admin UI already consumes it).
- Validation at boundaries only: step names and query params validated in handlers; internal code trusts typed inputs.

### TDD (red-green-refactor, matching repo conventions)

Existing convention is pure-function, table-driven tests with no live DB (see [apps/api/internal/db/enrichment_preserve_test.go](apps/api/internal/db/enrichment_preserve_test.go), [apps/api/internal/llm/client_test.go](apps/api/internal/llm/client_test.go)). Extract all decision logic into pure functions and write the failing test before each implementation:

- `normalize_test.go` — snapshot payload normalization + hashing: stable across key order, volatile fields stripped, distinct payloads → distinct hashes (directly validates assumption #1)
- `transitions_test.go` — given a `StepState`, which step is due: never-attempted, succeeded, failed-with-backoff-pending, backoff-elapsed, dead after N attempts, force-clears
- `backoff_test.go` — `next_*_attempt_at` computation: exponential curve, per-step caps, jitter bounds
- `skip_test.go` — LLM skip decision: unchanged hash + unchanged profile version → skip; hash change, profile bump, or force → run
- Pass orchestration tested with in-memory **fakes** implementing `StateStore`/`SnapshotStore`/`EventRecorder` and the existing scraper/LLM interfaces (fakes over mocks; assert on resulting state, not call sequences): PDP failure records error + backoff without touching LLM state; classify failure doesn't block extract retry of other listings; crash-resume is "just" selection over committed state
- Handler tests via `httptest` for the two new admin endpoints (auth, validation, idempotent retry), following `handlers_db_ops_test.go`
- Migration file picked up by existing `migrations_test.go` conventions; backfill logic extracted into a testable pure function over row values
- Definition of done per unit: test written first and observed failing, then minimal implementation, then refactor with tests green

### Go standards (golang-pro)

- `context.Context` on every blocking operation; passes honor job deadline and cancellation (existing `ENRICH_JOB_TIMEOUT` context flows through)
- Errors wrapped with `fmt.Errorf("...: %w", err)`; no swallowed errors; sentinel errors (e.g. `ErrStepDead`) where callers branch
- Config via env with defaults, same pattern as `ENRICH_BATCH_SIZE` (new: attempt caps, backoff base per step)
- Verification gate: `gofmt`, `go vet ./...`, `go test -race ./...` all clean before done
- No goroutine fan-out in MVP (sequential passes preserved), but interfaces keep a future worker-pool or separate-service extraction mechanical

## Not Doing (and Why)

- **Queue library (River/asynq) or Redis** — solves concurrency/scale we don't have; the state schema migrates cleanly to one later if needed
- **Separate Render worker service** — deployment decision deferred; design keeps the loop extractable
- **Concurrency/throughput work** — nightly job keeps up today; revisit when "growing" becomes "behind"
- **Human review loop in admin** — confidence surfacing first; a review UI is a later layer on the same ledger
- **Prompt-eval/replay harness** — snapshots make it possible later, but it's a separate project
- **Reworking variant fan-out** — stays a best-effort side effect of the PDP pass

## Open Questions

- Latest-only snapshots vs. short history (history enables prompt replay/eval later; latest-only is smaller)
- Attempt cap and backoff curve per step (PDP failures are often WAF/site issues; LLM failures are usually transient)
- Whether `llm_confidence_below` re-classification flows should migrate onto the new state model in the MVP or stay as-is
