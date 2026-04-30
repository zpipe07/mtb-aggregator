---
name: Optimistic filter UI
overview: Instant checkbox feedback by layering optimistic filter state on top of URL-derived params in `useFilterParams`, while keeping `router.replace` + `useTransition` for the results-panel loading treatment. The deals grid will still wait for the RSC refetch unless you later add client-side fetching.
todos:
  - id: optimistic-hook
    content: Add optimistic merge + ref-based sync/clear in useFilterParams; return display fields from optimistic ?? canonical
    status: completed
  - id: edge-cases
    content: Handle setCategoryFilter (path+query), sort relevanc e effect, rapid toggles, back/forward divergence
    status: completed
  - id: readme
    content: Adjust apps/web/README.md navigation feedback note for optimistic filters
    status: completed
isProject: false
---

# Responsive filter checkboxes (optimistic UI)

## What’s causing the lag

1. **Checkbox state is the URL** — [`CheckboxGroup`](apps/web/src/components/ui/checkbox-group.tsx) is controlled: `checked` comes from `selected` props sourced from [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts) → `parseFilterParamsFromURL(useSearchParams())`.

2. **Navigation is deferred** — `updateParams` wraps `router.replace` in `startTransition` ([`useFilterParams.ts` L120–123](apps/web/src/hooks/useFilterParams.ts)). That marks the route update as non-urgent, so **`useSearchParams()` often stays on the old value until the transition progresses**, which keeps checkboxes from flipping immediately.

3. **Deals list is server-driven** — [`DealsPage`](<apps/web/src/app/(public)/deals/page.tsx>) (and category routes) fetch deals on the server from `searchParams`. A new list **cannot** appear until the soft navigation completes and RSC payload arrives. [`DealsPageContent`](apps/web/src/views/DealsPageContent.tsx) already dims the grid and shows a spinner while `isFilterPending` ([L282–299](apps/web/src/views/DealsPageContent.tsx)).

So the triple delay you see (checkbox → URL → list) is largely **one pipeline**: deferred navigation + RSC.

## Recommended fix: optimistic filter state (targeted)

Implement **optimistic merged state** inside [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts) so the hook returns filter fields that reflect the **next** selection immediately, while still calling `startTransition(() => router.replace(...))` unchanged.

**Shape of the approach:**

- Compute **canonical** state exactly as today: `parseFilterParamsFromURL(searchParams)` plus category merge from pathname (`parseCategorySlugFromDealsPath`).
- On every `updateParams` (and the `setCategoryFilter` path that builds a new path + query), after building the final `URLSearchParams` and target pathname:
  - Derive **optimistic parsed state** by parsing the new query string with `parseFilterParamsFromURL` and applying the **same** category rules (path vs `category` param) as canonical.
  - `setOptimistic(thatParsed)`.
- Expose **`display` = `optimistic ?? canonical`** as the returned `searchQuery`, `brandFilters`, `specFilters`, `variantFilters`, etc., so [`DealFilters`](apps/web/src/components/DealFilters.tsx) / [`FilterSidebar`](apps/web/src/components/FilterSidebar.tsx) / [`FilterChips`](apps/web/src/components/FilterChips.tsx) read immediate values without changing those components.
- **Clear optimistic** when the browser URL catches up or diverges:
  - Keep a ref `lastRequestedQs` (and optionally pathname for category navigations) set in lockstep with `router.replace`.
  - `useEffect` on `searchParams` (and pathname if needed): if current serialized query matches `lastRequestedQs`, clear optimistic and ref; if the URL **changed** while optimistic is set but **does not** match `lastRequestedQs` (e.g. back/forward), clear optimistic and ref so UI snaps back to URL truth.

**Normalization:** Compare query strings in a stable way (e.g. sorted keys or canonical string builder) so minor ordering differences from `URLSearchParams` do not strand optimistic state forever.

**Edge cases to handle in implementation:**

- **Sort “relevance” when query empty** — mirror [`parseFilterParamsFromURL` / server effective sort](apps/web/src/lib/filterParams.ts) when building optimistic parsed state so chips/sort UI do not flicker.
- **`useEffect` that fixes `sort=relevance`** ([`useFilterParams.ts` L241–247](apps/web/src/hooks/useFilterParams.ts)) — ensure it does not fight optimistic state (only run when appropriate, or base effect on canonical-only).
- **Rapid successive toggles** — always update `lastRequestedQs` to the **latest** replace; avoid clearing optimistic on intermediate param strings if Next briefly applies an older navigation (prefer “clear only on match or explicit divergence” as above).

This aligns with Vercel guidance on **perceived performance**: immediate UI feedback for interactions (`rerender-use-transition` / optimistic patterns) while keeping long work transitions for the heavy RSC update.

## What this does _not_ fix (unless you choose follow-ups)

- **Deals grid content** will still update after the server round-trip. True instant grid updates would mean **client-side deals fetching** (e.g. TanStack Query keyed by filter params) or other architectural changes—larger scope.
- **Address bar** will still update with navigation timing; it may feel slightly ahead of the grid, which is normal.

## Docs

- Update the “Navigation feedback” bullet in [`apps/web/README.md`](apps/web/README.md) to note **optimistic filter controls** vs results pending state.

## Verification

- Manual: toggle brand/spec/variant checkboxes on `/deals` and `/deals/c/...` — checkbox and chips should update on the same click; grid may still lag with existing spinner.
- Optional: small unit test for a pure helper `normalizeFilterQueryString` / `filterStateFromSearchParams` if you extract serialization for tests.
