---
name: Clear filters keep category
overview: Adjust "Clear all" on category deal routes so it resets query-based filters while keeping the `/deals/c/...` path. The intrusive behavior comes from an explicit branch in `useFilterParams`; removing that branch aligns UX with treating category as browsing context vs. facet filters.
todos:
  - id: hook-clear-branch
    content: Remove /deals/c/ branch in clearAllFilters; always use updateParams in useFilterParams.ts
    status: completed
  - id: qa-category-clear
    content: Smoke-test category route + chips/sidebar Clear all retains path
    status: completed
  - id: analytics-docs
    content: Decide filters_cleared props + brief README/architecture touch if documenting filter UX
    status: completed
isProject: false
---

# Clear filters without clearing category (deals)

## Problem (refined)

**How might we** let shoppers reset storefront/spec/variant filters without abandoning their category drill-down, since category feels like "where I am browsing" rather than a removable filter?

**Current behavior:** In [`apps/web/src/hooks/useFilterParams.ts`](apps/web/src/hooks/useFilterParams.ts), `clearAllFilters` **short-circuits** when `pathname.startsWith("/deals/c/")`: it runs `router.replace("/deals")`, which wipes the URL path and sends users to bare `/deals`.

```177:181:apps/web/src/hooks/useFilterParams.ts
  const clearAllFilters = useCallback(() => {
    if (pathname.startsWith("/deals/c/")) {
      startTransition(() => router.replace("/deals"));
      return;
    }
```

**Elsewhere**, non-category URLs already use `updateParams({...})`, which calls `router.replace` with **the same `pathname`** (from [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts) ~109–111), only changing the query string. Category scoping comes from **`parseCategorySlugFromDealsPath`** merged into state (~83–87), so the path is the category source of truth—no conflicting query `category=` needed on `/deals/c/...`.

## Recommended direction

**Remove the `/deals/c/` special case** so `clearAllFilters` **always** uses the existing `updateParams` payload (clear search, store, brand, legacy `category` query, min*discount, min_price, exclude_category_slug, spec*\_, variant\_\_, offset).

- **Result:** On `/deals/c/bikes/...`, "Clear all" yields the **same pathname** with an empty/minimal query (same pattern as clearing from `/deals`).
- **No change** to chips, sidebar, or `DealsPageContent` handlers unless we want copy tweaks—the hook owns the semantics.

### Intuitive model (stress-test)

| Criterion           | Notes                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **User value**      | Painkiller for "I cluttered my facet filters but still want this category"; matches common e-commerce separation of taxonomy vs. filters. |
| **Feasibility**     | Trivial—delete branch; rely on tested `updateParams`/`applyToParams`.                                                                     |
| **Differentiation** | Better than wiping navigation context without adding new UI.                                                                              |

**Assumption to validate (lightweight):** Users who tap "Clear all" on a category page rarely intend to jump to `/deals` without category; if they want that, breadcrumbs / category nav remain. Optional future: analytics on `filters_cleared` with `{ on_category_route: boolean }` to confirm nothing regresses—see below.

### Not doing (for this MVP)

- **Replacing label** ("Clear filters only")—not required if behavior matches the label once fixed.
- **Separate control** to reset category—that already exists via category nav/back to `/deals`; no duplicate needed now.
- **Changing what counts toward `activeFilterCount`**—unchanged unless product wants search counted (out of scope).

## Implementation

1. In [`apps/web/src/hooks/useFilterParams.ts`](apps/web/src/hooks/useFilterParams.ts), implement `clearAllFilters` as **only** the `updateParams({ ... })` call (same fields as today for `/deals`). Remove `pathname`/early `router.replace("/deals")` from the dependency array if unused.
2. **Manual QA:** `/deals/c/...` + store/brand/spec/variant/query params → Clear all stays on category path with filters gone; `/deals` without category path behaves as before.
3. **PostHog:** [`DealsPageContent`](apps/web/src/views/DealsPageContent.tsx) still fires `posthog.capture("filters_cleared")` on clear; behavior change is user-visible. Per workspace rule, either **extend** the event with a stable prop (e.g. `had_category_path: pathname.startsWith("/deals/c/")`) for funnel sanity, or **document** intentional no-change in the PR—the change is orthogonal to funnel steps but worth a one-line note in [`apps/web/README.md`](apps/web/README.md) if that file documents filter events.

4. **Docs:** Per documentation-sync rule, a short UX note under the web app's deals/filter section in [`apps/web/README.md`](apps/web/README.md) is enough unless [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) duplicates filter URL behavior—in that case align one sentence only.

No API or scraper changes.
