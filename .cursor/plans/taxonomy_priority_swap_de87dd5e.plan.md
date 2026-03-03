---
name: Taxonomy priority swap
overview: Add inline up/down arrow buttons to the taxonomy table for one-click priority reordering, with automatic swap logic so no two mappings share the same priority.
todos:
  - id: sort-mappings
    content: Sort mappings by priority descending before rendering
    status: completed
  - id: swap-handler
    content: Add handleSwapPriority function that fires two update mutations with swapped priority values
    status: completed
  - id: inline-buttons
    content: Add up/down arrow buttons in the Priority column with proper disabled states
    status: completed
  - id: swapping-state
    content: Add swapping state to prevent concurrent swaps
    status: completed
isProject: false
---

# Inline Priority Swap for TaxonomyManager

## Current behavior

- The taxonomy table shows mappings with `canonical`, `raw_keywords`, and `priority` columns.
- To change priority, you click "Edit", which opens a full `MappingForm` inline, change the number input, and click "Save".
- Nothing prevents two mappings from having the same priority value.

## Proposed change

Add **up/down arrow buttons** directly in the Priority column of each table row. Clicking an arrow **swaps** the clicked mapping's priority with its neighbor, so both requirements are met:

1. **One click** -- no need to enter edit mode.
2. **No duplicate priorities** -- it's always a swap between two items.

### How it works

- Sort the mappings list by `priority` descending (higher = matched first, so highest is row 0).
- Each row gets an up arrow and a down arrow next to the priority number.
- **Up arrow (increase priority):** swap this row's priority with the row above it. Disabled on the first row.
- **Down arrow (decrease priority):** swap this row's priority with the row below it. Disabled on the last row.
- Each swap fires two `updateTaxonomyMapping` calls via `Promise.all`, sending the full body for each mapping with the other's priority.

### Files to change

Only one file: [apps/web/src/admin/TaxonomyManager.tsx](apps/web/src/admin/TaxonomyManager.tsx)

1. Sort `mappings` by priority descending before rendering (`[...mappings].sort((a, b) => b.priority - a.priority)`).
2. Add a `handleSwapPriority(mappingA, mappingB)` async function that calls `updateMutation.mutateAsync` twice with swapped priorities.
3. Replace the static priority `<td>` with the priority value flanked by up/down buttons:

```tsx
<td className="px-4 py-2 text-right text-stone-600">
  <div className="inline-flex items-center gap-1">
    <button
      onClick={() => handleSwapPriority(sorted[i - 1], m)}
      disabled={i === 0 || swapping}
    >
      ↑
    </button>
    <span>{m.priority}</span>
    <button
      onClick={() => handleSwapPriority(m, sorted[i + 1])}
      disabled={i === sorted.length - 1 || swapping}
    >
      ↓
    </button>
  </div>
</td>
```

1. Add a `swapping` state boolean to disable buttons while a swap is in flight, preventing race conditions.

### What stays the same

- The "Edit" button and `MappingForm` remain for editing canonical path, raw keywords, and priority manually (useful for setting an exact value).
- The create form, delete, and recategorize flows are untouched.
- No API or backend changes needed -- the existing `PUT /admin/taxonomy/:id` endpoint is sufficient.
