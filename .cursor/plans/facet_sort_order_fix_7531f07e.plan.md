---
name: Facet sort order fix
overview: Align GET /facets `spec_facets` order with LLM Prompt Profile field order by sorting filterable fields ascending on `sort_order` (matching admin `0, 1, 2…`).
todos:
  - id: sort-asc
    content: Flip parseFilterableFields sort to ascending sort_order in specs.go
    status: completed
  - id: docs-touch
    content: Update API/ARCHITECTURE only if facets order is documented
    status: completed
isProject: false
---

# Match facet filter order to admin (low to high)

## Cause

`[parseFilterableFields](apps/api/internal/db/specs.go)` currently sorts filterable fields with `**sort_order` descending (`out[i].sortOrder > out[j].sortOrder`), which inverts the admin composition list (where the first row is `sort_order` 0).

## Change

In `[apps/api/internal/db/specs.go](apps/api/internal/db/specs.go)`, update the `sort.Slice` comparator in `parseFilterableFields` to use **ascending** `sort_order`:

- When `sortOrder` differs: `return out[i].sortOrder < out[j].sortOrder`
- Keep the tie-breaker: `out[i].key < out[j].key`

No web changes: `[FilterSidebar.tsx](apps/web/src/components/FilterSidebar.tsx)` / `[DealFilters.tsx](apps/web/src/components/DealFilters.tsx)` already render `spec_facets` in API order.

## Verification

- No Go tests reference this sort; optional manual check: select a category with a profile, confirm sidebar spec filters match top-to-bottom order from Prompt Profiles.
- If `[apps/api/README.md](apps/api/README.md)` or `[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)` mention facet ordering, add a one-line note that `spec_facets` follow profile field `sort_order` ascending; skip doc edits if nothing mentions order.
