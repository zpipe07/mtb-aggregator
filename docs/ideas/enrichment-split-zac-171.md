# Enrichment Pipeline Split (ZAC-171)

Cross-store enrich contract (inputs, skip, idempotency): [docs/specs/enrichment-normalization-zac-253.md](../specs/enrichment-normalization-zac-253.md).

## Problem Statement

How might we let each enrichment step run on its own cadence — PDP fetching politely throttled per store, LLM steps running within minutes of a scrape — while making pipeline health obvious at a glance?

## Recommended Direction

The durable 3-step state machine (`pdp` → `classify` → `extract` in `apps/api/internal/enrichstate/`, migration `028`) already separates the steps at the data layer, and classify/extract already read from the DB, never from stores (which also resolves ZAC-211's core ask). The redesign is operational, in three parts:

1. **Continuous polite PDP drainer.** Replace the nightly PDP batch inside `Pipeline.RunJob` with a resident background loop that claims due PDP work round-robin across stores, enforcing a per-store minimum interval (default ~1 req/15s, env-tunable). The in-memory per-job circuit breaker becomes a persistent per-store cooldown. Fold in ZAC-90: stretch the PDP stale horizon from 7d to ~30d so scrapes maintain price/stock and PDP re-fetch is rare (never-fetched, wiped metadata, manual, or 30d stale). `ClaimForStep` SQL takes `pdpStaleAfter` from config (default 30d).

2. **Scrape-triggered LLM passes.** At the end of each scrape job (and after PDP snapshot writes), kick a classify+extract pass for due listings — reusing the existing DB-only `llm_specs`-style path. Keep a slow safety-net cron. Result: new listings are categorized and spec'd within minutes, not up to 24h.

3. **Flow-centric Insights.** Rework the admin Insights page around one headline metric — time from scrape to fully enriched (p50/p95) — plus per-step due/in-flight/dead gauges, oldest-due age, and per-store PDP pace and cooldown status. Reporting shifts from `enrich_jobs` windows to `listing_enrichment` state + `enrichment_events` rates, since a continuous drainer has no job boundary.

## Assumptions (validated 2026-08-26)

- [x] **API process is long-lived on Render** — `mtb-aggregator API` is an always-on `web_service` (starter plan, 1 instance); a drainer goroutine survives, and restarts resume cleanly from DB state.
- [x] **Drainer throughput covers the backlog** — production DB has ~27,300 enricher-eligible listings across 28 stores. At a 30d horizon that is ~910 PDP fetches/day total; the largest store (cambriabikes, 10,262 listings) needs ~1 fetch per 4 minutes. A 1-req/15s per-store pace has ~15x headroom on the largest store.
- [x] **The nightly job is not keeping up today** — ~20k of 27k eligible listings are >7 days PDP-stale (cambriabikes alone: 9,286). The windowed nightly job cannot drain this backlog; the drainer is a correctness fix, not just politeness.
- [x] **Claim safety under concurrency** — migration `042` adds per-step `*_leased_until`; `ClaimForStep` atomically claims with `FOR UPDATE SKIP LOCKED`; leases cleared on success/failure/skip via `ReleaseLease`. DB tests in `enrichment_state_db_test.go` (require `TEST_DATABASE_URL`).
- [ ] **LLM cost tracks listing churn, not scrape frequency** — only *due* work (new or changed listings, hash/profile invalidation) is claimed. Watch OpenAI spend after Phase 1 ships.
- **Skip-loop fix (migration `044`):** `pdp_hash` is the hash last processed by classify/extract. Migration `028` backfilled `classified_at`/`extracted_at` but left `pdp_hash` NULL; claim SQL (`IS DISTINCT FROM`) kept those rows due while skip logic treated empty hash as unchanged — hourly LLM jobs re-skipped the same listings. **`044`** stamps hashes from snapshots; runtime **`StampLLMSkipInputs`** stamps on skip without re-running LLM. Apply **`044`** on Neon with deploy.

## MVP Scope (implementation phases, as separate tickets)

- **Phase 0 — Claim hardening:** shipped (ZAC-223) — lease/in-flight semantics on `listing_enrichment` claims.
- **Phase 1 — LLM freshness:** scrape-triggered classify+extract pass + safety-net cron; split job types so LLM never waits on PDP.
- **Phase 2 — PDP drainer:** [x] resident loop, per-store pacing, persistent per-store cooldown, 30d stale horizon.
- **Phase 3 — Insights rework:** [x] scrape-to-enriched latency headline, step flow gauges, per-store PDP status; event-based throughput (no synthesized `enrich_jobs` windows).

## Not Doing (and Why)

- **River or any queue library/external service** — the Postgres state machine already provides durability; one process doesn't need worker infrastructure.
- **Competitive Cyclist PDP** — stays WAF-blocked, admin/backfill only, unchanged.
- **LISTEN/NOTIFY or webhook plumbing** — a direct function call at scrape-job end achieves the same freshness with zero moving parts.
- **Per-store politeness config UI** — start with a global default + env override; add per-store knobs only if a store proves sensitive.

## Open Questions

- Default pacing value (1 req/15s per store?) and whether any store needs a stricter override from day one.
- How manual `/enrich-now` and force-enrich interact with the drainer — **resolved:** burst bypasses min-interval; honors cooldown unless `force=1`.
- Whether to keep synthesizing `enrich_jobs` rows (e.g. hourly windows) for continuity of existing dashboards — **resolved:** cut over to `enrichment_events` + `listing_enrichment` on Insights; Operations keeps job history for bursts/LLM.
