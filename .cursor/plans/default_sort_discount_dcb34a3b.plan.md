---
name: Default sort discount
overview: Change the canonical default sort from `newest` to `discount` for the public deals experience by updating URL parsing, URL serialization (clean URLs), client API params, and API DB defaults—plus an explicit decision on whether the sitemap build should keep iterating deals with `sort=newest` or align with discount.
todos:
  - id: web-filter-params
    content: Update filterParams.ts defaults + relevance→effectiveSort to discount
    status: completed
  - id: web-use-params
    content: Flip applyToParams omit logic + relevance useEffect for discount
    status: completed
  - id: web-queries
    content: Default sort in hooks/queries.ts buildDealsParams to discount
    status: completed
  - id: api-db
    content: Default empty sort + no-search relevance normalization to discount in GetDeals + getDealsGrouped
    status: completed
  - id: docs-api-readme
    content: Update apps/api/README.md Sort default
    status: completed
  - id: sitemap-decision
    content: "Confirm sitemap: keep newest (recommended) or switch fetch to discount"
    status: completed
isProject: false
---

# Default deals sort: Newest → Highest discount

## Ideation synthesis (problem and tradeoffs)

**How might we help visitors immediately see the most compelling sale prices without an extra click?** Many deal shoppers optimize for savings first; chronological “newest” is better when freshness is the headline (drops, seasonal inventory).

| Consideration                                                              | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User value**                                                             | Strong fit for “show me steals” browsing; weaker for users who valued “what just landed.”                                                                                                                                                                                                                                                                                            |
| **Bookmark URLs**                                                          | Clean `/deals` (no `sort`) currently implies **newest**; after the change it implies **discount** — a behavior shift for saved links. Explicit `sort=newest` keeps old intent.                                                                                                                                                                                                       |
| **Clean URLs**                                                             | Today [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts) **omits** `sort` from the URL when the user selects `"newest"` (line 49: `updates.sort === "newest" ? ""`). For discount as default, omit `sort` when `sort === "discount"` and **emit** `sort=newest` when the user selects newest (mirror the inverted pattern).                                                  |
| **Edge case: relevance without search**                                    | [`filterParams.ts`](apps/web/src/lib/filterParams.ts) maps empty query + `relevance` → `newest`; [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts) syncs dangling `sort=relevance` to `newest` after clearing search. Align both with the **new** default (`discount`) so “invalid relevance” behaves like landing on `/deals`.                                             |
| **Sitemap** ([`apps/web/src/app/sitemap.ts`](apps/web/src/app/sitemap.ts)) | Build currently uses `fetchDeals({ sort: "newest", ... })` to paginate deal detail URLs under a **cap**. Changing that sort changes **which** deals surface first — not required for UX consistency. **Recommendation:** keep **`sort: "newest"`** here so crawl priority stays tied to freshness/recency; only change if you explicitly want sitemap parity with homepage ordering. |

**Assumptions to validate:** (a) Majority of `/deals` sessions care more about discount than recency; (b) you accept the bookmark/`/deals` default behavior change unless you later add rollout or analytics.

---

## Implementation (when approved)

### 1. Web — parsing and canonical URL

[`apps/web/src/lib/filterParams.ts`](apps/web/src/lib/filterParams.ts)

- Replace fallback when `sort` is missing or invalid from `"newest"` to `"discount"` (both `parseFilterParamsFromSearch` and `parseFilterParamsFromURL`).
- Change `effectiveSort` for empty search + relevance from `newest` to `discount` (both parsers).

[`apps/web/src/hooks/useFilterParams.ts`](apps/web/src/hooks/useFilterParams.ts)

- In `applyToParams`, omit `sort` from the URL when the selected sort is **`discount`** (default), not `newest`:
  - e.g. `set("sort", updates.sort === "discount" ? "" : updates.sort)` (adjust so empty string deletes the param as today).
- Update the `useEffect` that rewrites lingering `sort=relevance` after search clears from `sort: "newest"` to `sort: "discount"`.

[`apps/web/src/hooks/queries.ts`](apps/web/src/hooks/queries.ts)

- `buildDealsParams`: change `sort: params.sort ?? "newest"` to `?? "discount"`.

### 2. API — default sort for `GET /deals`

[`apps/api/internal/db/db.go`](apps/api/internal/db/db.go) — `GetDeals`: replace empty-sort default and relevance-without-search normalization (`newest` → `discount`).

[`apps/api/internal/db/deals_grouped.go`](apps/api/internal/db/deals_grouped.go) — same for `getDealsGrouped`.

**Out of scope unless you ask:** [`GetAdminListings`](apps/api/internal/db/db.go) defaults stay `newest` — admin data browser UX is separate from public deals.

### 3. Docs

- [`apps/api/README.md`](apps/api/README.md): update **Sort** line to document `discount` as default (was `newest`).
- Workspace doc-sync rule applies; no broader architecture doc churn unless something else references “default newest.”

### 4. No PostHog contract change expected

[`Toolbar.tsx`](apps/web/src/components/Toolbar.tsx) uses `sort_changed` on user action only; default does not emit an event unless you add one (optional, not proposed).

---

## Verification

- Manual: open `/deals` with no query — toolbar shows **Highest discount**, ordering matches API `sort=discount`.
- Manual: choose **Newest** — URL should gain `sort=newest` (or equivalent) and persist.
- Optional: curl `GET /deals` without `sort` and confirm ordering matches discount semantics.
