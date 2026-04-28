---
name: Min discount select
overview: Replace the numeric "Min discount %" control with a `FilterSelect` offering an "Any" (no filter) option plus 10%–100% in steps of 10%, reusing existing URL/API plumbing. Handle legacy bookmark URLs with non-step values by merging the current value into the option list (same pattern as brand facets in the sidebar).
todos:
  - id: helper-options
    content: Add buildMinDiscountSelectOptions (+ static 10–100 steps, stale-merge) in apps/web
    status: completed
  - id: deal-filters-sidebar
    content: Replace FilterInput with FilterSelect in DealFilters.tsx and FilterSidebar.tsx
    status: completed
  - id: cleanup-docs
    content: Remove unused FilterInput.tsx; update apps/web/README.md filter component line
    status: completed
isProject: false
---

# Min discount: number input → stepped select

## Why this works

- **API unchanged**: [`GET /deals`](apps/api/internal/api/handlers.go) already parses `min_discount` as a float; the web continues to send the same [`min_discount`](apps/web/src/api.ts) query param via existing [`parseFloat`](<apps/web/src/app/(public)/deals/page.tsx>) / [`filterParams`](apps/web/src/lib/filterParams.ts) flow.
- **UX**: A native `<select>` (already wrapped by [`FilterSelect`](apps/web/src/components/FilterSelect.tsx)) is consistent with Store, Brand, and Sort filters and avoids empty/typed junk values from `<input type="number">`.
- **Bookmarks**: URLs like `?min_discount=25` should keep working: if `25` is not one of the fixed steps, **prepend** a `{ value: "25", label: "25% …" }` option so the control stays controlled and the user can change or clear—mirroring [`mergeSelectedFacetValue`](apps/web/src/components/FilterSidebar.tsx) / brand-stale-url behavior.

## Option list (recommended)

| `value` (URL) | Label (copy can be tuned in implementation)             |
| ------------- | ------------------------------------------------------- |
| `""`          | No minimum (or "Any discount")                          |
| `10` … `100`  | Step of 10 only: e.g. "At least 10%", … "At least 100%" |

- Do **not** add a redundant "0%" row—empty string already means "no `min_discount` param" (same semantics as today when the field is blank).

## Implementation

1. **Shared helper** (small module under [`apps/web/src/components/`](apps/web/src/components/) or [`apps/web/src/lib/`](apps/web/src/lib/)), e.g. `minDiscountFilterOptions.ts`:
   - Export `STEP_MIN_DISCOUNT_OPTIONS`: static list `10, 20, …, 100` with labels.
   - Export `buildMinDiscountSelectOptions(current: string): { value: string; label: string }[]`:
     - Start with `{ value: "", label: "…" }` + stepped options.
     - If `current` is non-empty, not equal to `""`, and **not** in the stepped set (and optionally validate it parses as a number for sanity), prepend one option so `<Select value={current}>` matches.

2. **`DealFilters.tsx`**: Swap [`FilterInput`](apps/web/src/components/DealFilters.tsx) for `FilterSelect`; use `buildMinDiscountSelectOptions(minDiscount)`; keep existing `handleMinDiscountChange` / Vercel `track("filter_applied", { type: "min_discount", value })`—event shape stays unchanged.

3. **`FilterSidebar.tsx`**: Same replacement for the sidebar block (~lines 105–112).

4. **`FilterInput.tsx`**: Currently **only** used for min discount (confirmed via grep). After migration, **remove** this component to avoid dead code, unless you prefer leaving it for future use (leaning remove per focused diff).

5. **Docs**: Per repo documentation-sync for component mentions, adjust the single line in [`apps/web/README.md`](apps/web/README.md) that lists `FilterInput` alongside other filter components—replace with noting `FilterSelect` + the new helper if `FilterInput` is deleted.

## Analytics / PostHog

- [`DealsPageContent.tsx`](apps/web/src/views/DealsPageContent.tsx) `filter_applied` with `filter_type: "min_discount"` stays valid; values become step strings (or preserved legacy strings). No intentional contract break.

## Accessibility / guidelines

- Prefer the existing labeled `FilterSelect` pattern (`<label>` + native `Select`) so keyboard and screen readers get a proper pairing—aligned with typical Web Interface Guidelines expectations for native form controls without extra work.
