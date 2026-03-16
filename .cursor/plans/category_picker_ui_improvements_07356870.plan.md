---
name: Category picker UI improvements
overview: Address mobile clunkiness, narrow-sidebar layout issues, and unclear parent-selection by replacing the dropdown with an inline expandable section and renaming "Select" to "View all [category]".
todos: []
isProject: false
---

# Category Picker UI Improvements

## Current Pain Points

1. **Clunky on mobile** — Dropdown popover with small tap targets; overlays compete with the filter drawer
2. **Narrow sidebar layout** — 240px sidebar; dropdown inherits width; breadcrumb and "Select" button cramp
3. **Parent selection unclear** — "Select" is vague; should read "View all Drivetrain" or similar

## Proposed Approach: Inline Expandable Section

Replace the dropdown with an **inline collapsible section** that expands/collapses in-place. This removes the popover, uses full layout width, and behaves well on mobile.

### Before vs After

**Before:** Trigger button → floating dropdown panel (positioned absolutely, min-w, z-50)

**After:** Collapsible header ("Category" + current value + chevron) → inline content when expanded (breadcrumb, items flow in document)

### Benefits

- **No dropdown** — No positioning, overflow, or z-index; content flows with the sidebar
- **Full width** — Always 100% of parent; no `min-w-[200px]` conflicts
- **Mobile-friendly** — No overlay; content scrolls with the drawer; larger tap targets possible
- **Space** — Collapsed state is compact (single row like Store/Brand); expanded adds no extra chrome

---

## Implementation Plan

### 1. Refactor `CategoryDrillDown` to inline expandable mode

Rename or create a variant: `**CategoryDrillDown` becomes an inline section.

**Trigger (collapsed):**

- Row with label "Category", current value (or "All categories"), and chevron
- Click toggles expansion (no separate floating panel)
- Styled to match filter row density (similar to Store/Brand)

**Content (expanded):**

- "All categories" link at top
- Breadcrumb + back when drilled in
- Replace "Select" with **"View all [category]"** (e.g., "View all Drivetrain") in the breadcrumb area
- Same drill-down list (Children, or leaf items)
- For rows with children that are also selectable: add inline "View all [label]" link/button instead of separate "Select"

**Layout:** All content inside a single block. No `position: absolute`, no `min-w`. Use `overflow-y-auto` with `max-h` only if needed when there are many items.

### 2. Parent-selection UX: "View all [category]"

When the current drill level is selectable (e.g., we're at "Components > Drivetrain" and that path is in options):

- **Breadcrumb area:** Show "View all Drivetrain" (or "View all [current-level-label]") instead of "Select"
- **Rows with children:** For nodes like "Drivetrain" that have children and are selectable, show "View all Drivetrain" as a secondary action (e.g., small link or button next to the drill chevron)

Copy options: "View all Drivetrain" or "All Drivetrain" or "Drivetrain (all)" — recommend "View all [category]" for clarity.

### 3. Mobile refinements

- Ensure tap targets are at least 44px (e.g., `py-2.5` or `min-h-[44px]` on interactive rows)
- In `FilterDrawer`, the inline section scrolls with filters — no separate overlay
- Consider `-mx-4` + `px-4` so the expanded content can use full drawer width if the sidebar has padding

### 4. Files to modify

| File                                                                   | Changes                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [CategoryDrillDown.tsx](apps/web/src/components/CategoryDrillDown.tsx) | Replace dropdown with inline expandable; "Select" → "View all [label]"; remove absolute positioning, min-w |
| [FilterSidebar.tsx](apps/web/src/components/FilterSidebar.tsx)         | No props changes; `CategoryDrillDown` remains drop-in                                                      |
| [DealFilters.tsx](apps/web/src/components/DealFilters.tsx)             | Same; no API changes                                                                                       |

### 5. Optional: Full-screen category picker on mobile

If the inline section still feels tight on phones, consider:

- **Desktop:** Inline expandable (as above)
- **Mobile:** Tapping "Category" in the drawer opens a **full-screen slide-over** or **full-page** category picker with the same drill-down UI

This would require a `useMediaQuery` or similar to detect mobile and render either inline or a different layout. Recommend implementing the inline approach first and adding this only if needed.

---

## Visual Sketch

```
Category                          [▼]   ← collapsed: one row
────────────────────────────────────────
All categories
Components › Drivetrain    [←]  View all Drivetrain   ← when drilled in
────────────────────────────────────────
  Cassettes
  Shifters
  Chains
```

When collapsed, the row shows "All categories" or "Cassettes" (leaf) as the current value. Clicking expands to show the list inline.

---

## Summary

- **Inline over dropdown** — avoids narrow-width and mobile overlay issues
- **"View all [category]"** — clearer than "Select" for parent selection
- **Same data/API** — no backend or FilterSidebar prop changes; only `CategoryDrillDown` internal layout
