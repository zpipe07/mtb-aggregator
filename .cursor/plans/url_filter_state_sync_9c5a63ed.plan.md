---
name: URL filter state sync
overview: Replace local `useState` filter state in `DealsPage` with URL search params via a custom `useFilterParams` hook, so all filters, search, sort, and pagination survive page refresh and are shareable via URL.
todos:
  - id: create-hook
    content: Create `useFilterParams` hook in `apps/web/src/hooks/useFilterParams.ts` that reads/writes all filter state to URL search params via `useSearchParams`
    status: completed
  - id: refactor-deals
    content: Refactor `DealsPage` in `App.tsx` to replace 9 `useState` calls and helper functions with the new `useFilterParams` hook
    status: completed
  - id: verify-debounce
    content: Verify SearchBar debounce works correctly with URL-backed state (initial value from URL, debounced writes back)
    status: completed
  - id: test-edge-cases
    content: "Test edge cases: invalid URL params, back/forward navigation, clear-all, canonical category change clears specs"
    status: completed
isProject: false
---

# Persist Filter State in URL Search Params

## Current State

All filter/search/sort/pagination state in `DealsPage` ([App.tsx](apps/web/src/App.tsx)) is held in local `useState` calls (lines 29-37) and lost on refresh. Only the `deal` modal param is already in the URL via `useSearchParams`.

## Approach

Create a custom `useFilterParams` hook that wraps `useSearchParams` from React Router v6. This hook will:

- Read initial values from URL search params on mount
- Expose the same getter/setter API the component uses today
- Write back to the URL whenever a value changes
- Coalesce all param updates into a single `setSearchParams` call per change to avoid redundant history entries

This is a **single-file addition** plus a **refactor of `DealsPage`** -- no new dependencies needed.

## URL Param Mapping

- `q` -- search query
- `store` -- store filter
- `brand` -- brand filter
- `category` -- raw category filter
- `canonical_category` -- canonical category path (URL-encoded)
- `min_discount` -- minimum discount percentage
- `spec_*` -- dynamic spec filters (e.g. `spec_material=Carbon`, `spec_wheel_size=29`)
- `sort` -- sort option (omit when default `newest`)
- `offset` -- pagination offset (omit when `0`)
- `deal` -- selected deal ID (already exists, will be preserved)

Empty/default values will be **omitted** from the URL to keep it clean.

## Implementation

### 1. Create `useFilterParams` hook

New file: [apps/web/src/hooks/useFilterParams.ts](apps/web/src/hooks/useFilterParams.ts)

This hook will:

- Call `useSearchParams()` once
- Parse all filter values from the current `URLSearchParams` (with defaults for missing params)
- Return a state object and individual setter functions that mirror the current API
- Each setter will call `setSearchParams` using the functional updater form `(prev) => next` to preserve other params (especially `deal`)
- Spec filters will use a `spec_` prefix convention: keys like `spec_material`, `spec_wheel_size`
- The `deal` param will pass through untouched (the existing `selectedDealId` / `setSelectedDealId` logic can stay as-is or be folded in)

Key signature (sketch):

```typescript
interface FilterState {
  searchQuery: string;
  storeFilter: string;
  brandFilter: string;
  categoryFilter: string;
  canonicalCategoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  sort: SortOption;
  offset: number;
}

interface FilterActions {
  setSearchQuery: (v: string) => void;
  setStoreFilter: (v: string) => void;
  setBrandFilter: (v: string) => void;
  setCategoryFilter: (v: string) => void;
  setCanonicalCategoryFilter: (v: string) => void;
  setMinDiscount: (v: string) => void;
  setSpecFilter: (key: string, value: string) => void;
  clearSpecFilter: (key: string) => void;
  setSort: (v: SortOption) => void;
  setOffset: (v: number) => void;
  clearAllFilters: () => void;
}
```

Each setter will use `setSearchParams((prev) => { ... })` with `{ replace: true }` to avoid polluting browser history on every keystroke/filter change.

### 2. Refactor `DealsPage` in [App.tsx](apps/web/src/App.tsx)

- Remove the 9 `useState` calls (lines 29-37)
- Remove the manual `clearAllFilters`, `setSpecFilter`, `clearSpecFilter` functions
- Import and call `useFilterParams()` instead
- Keep the existing `useSearchParams`-based `selectedDealId` / `setSelectedDealId` logic (the hook will preserve the `deal` param)
- The inline callbacks on `DealFilters` that reset offset (e.g. `(v) => { setStoreFilter(v); setOffset(0); }`) will be handled inside the hook -- each filter setter will auto-reset offset to 0
- The `useEffect` that resets sort from `relevance` to `newest` when search clears (line 124-126) will move into the hook

### 3. Handle `SearchBar` debounce

`SearchBar` already has internal debounce (300ms) with a `local` state and calls `onChange` after the timeout. This means the URL will only update after the debounce settles, which is the desired behavior -- no extra work needed. The `searchQuery` in the URL will reflect the debounced value, and on page load the `SearchBar` will initialize its `local` state from the `value` prop (which now comes from the URL).

### 4. Handle edge cases

- **Spec filter keys with spaces/special chars**: use `encodeURIComponent` / `decodeURIComponent` (URLSearchParams handles this automatically)
- **Invalid sort values in URL**: fall back to `"newest"`
- **Non-numeric offset**: fall back to `0`
- **Browser back/forward**: React Router's `useSearchParams` automatically re-renders on popstate, so back/forward navigation will restore previous filter states naturally

## Result

A URL like `/?q=carbon&canonical_category=Bikes+%3E+Mountain&sort=price_asc&spec_material=Carbon&offset=24` will fully restore the user's filter state on refresh or when shared.
