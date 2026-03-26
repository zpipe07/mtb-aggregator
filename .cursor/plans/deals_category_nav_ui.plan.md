---
name: Deals category nav UI
overview: "Move category selection above the deals grid with breadcrumbs and chip navigation; keep other filters in the sidebar/drawer. Align PostHog with the new navigation affordances."
todos:
  - id: tree-helpers
    content: Add categoryTree.ts helpers (find by slug, ancestors, children for browse level)
    status: pending
  - id: deals-category-nav
    content: Build DealsCategoryNav (Card, breadcrumbs, scrollable chips, a11y)
    status: pending
  - id: wire-deals-page
    content: Integrate into DealsPageContent; adjust activeFilterCount + FilterChips
    status: pending
  - id: filter-sidebar
    content: Remove CategoryDrillDown from FilterSidebar (drawer + desktop)
    status: pending
  - id: posthog
    content: Extend category analytics (properties and/or docs); verify insights still valid
    status: pending
  - id: storybook-tests
    content: Add Storybook story + optional unit tests for helpers
    status: pending
  - id: docs
    content: Update apps/web/README.md for deals category UX + PostHog event notes
    status: pending
isProject: false
---

# Implement deals page category navigation (design-aligned)

## Current behavior (baseline)

- Category is a single URL param `category` (slug), managed by [`useFilterParams`](apps/web/src/hooks/useFilterParams.ts).
- [`FilterSidebar`](apps/web/src/components/FilterSidebar.tsx) renders [`CategoryDrillDown`](apps/web/src/components/CategoryDrillDown.tsx) together with brand/store/discount/specs/variants.
- [`DealsPageContent`](apps/web/src/views/DealsPageContent.tsx): sticky sidebar (`lg+`) + main column with Toolbar, FilterChips, count, pagination, DealGrid. Mobile uses [`FilterDrawer`](apps/web/src/components/FilterDrawer.tsx).

No API changes: [`CategoryTreeNode`](apps/web/src/api.ts) already exposes `slug`, `name`, `children`, `sort_order`.

## Target UX

- **No `category`:** chip row = top-level tree nodes (order by `sort_order`, consistent with existing [`TOP_ORDER`](apps/web/src/components/CategoryDrillDown.tsx) intent where practical).
- **`category` set:** breadcrumb = **All** (clears) + clickable ancestors; current segment is plain text.
- **Drilled in:** chip row = **direct children** of the selected node; if leaf, hide chip row (or minimal empty hint).
- **Filters:** brand, store, discount, spec, variant remain in **sidebar / drawer** only — remove `CategoryDrillDown` from [`FilterSidebar`](apps/web/src/components/FilterSidebar.tsx).
- **Mobile:** horizontal scroll for chips, comfortable tap targets (~44px), theme tokens per component-library rule.

## Implementation steps

1. **Tree helpers** — [`apps/web/src/lib/categoryTree.ts`](apps/web/src/lib/categoryTree.ts): `findCategoryBySlug`, ancestor chain, `getChildNodesForBrowseLevel(tree, selectedSlug)`.

2. **`DealsCategoryNav`** — new component; props: `categoryTree`, `categoryFilter` (slug), `onCategoryChange`. Card + breadcrumb row + scrollable chips.

3. **`DealsPageContent`** — render nav in main column above FilterChips; reuse `handleCategoryChange` for PostHog (see below).

4. **`FilterSidebar`** — remove the `CategoryDrillDown` block. Do not change [`DealFilters.tsx`](apps/web/src/components/DealFilters.tsx) unless aligning legacy flows later.

5. **`activeFilterCount` + `FilterChips`** — exclude `categoryFilter` from the mobile filter badge count; remove category from removable chips (clear via All / breadcrumb / chips).

6. **Storybook + optional unit tests** for `DealsCategoryNav` and helpers.

7. **Docs** — [`apps/web/README.md`](apps/web/README.md): deals category UX + PostHog (see below).

## PostHog (do with this feature)

**Today:** [`DealsPageContent`](apps/web/src/views/DealsPageContent.tsx) fires `posthog.capture("filter_applied", { filter_type: "category", value })` on category change. Home uses [`category_clicked`](apps/web/src/components/CategoryCard.tsx) for category cards.

**Recommended for the new UI (pick one strategy and document it):**

- **Preferred (backward-friendly):** keep the event name `filter_applied` for category changes so existing PostHog insights that filter on `filter_type = category` keep working. Add optional properties, for example:
  - `nav_source`: `"breadcrumb" | "chip" | "all_clear"` (or `"sidebar"` if any legacy path remains)
  - `category_slug`: same as today’s `value` (consider aliasing so dashboards can migrate to a clearer name over time)

- **If Product needs a separate funnel:** add a dedicated event (e.g. `category_navigation`) only if `filter_applied` cannot represent breadcrumb vs chip; avoid duplicate fires for the same user action.

**Checklist:**

- [ ] Search `posthog.capture` in deals and category-related files after implementation.
- [ ] Update [`apps/web/README.md`](apps/web/README.md) with event names and new properties.
- [ ] If the team uses [`posthog-setup-report.md`](posthog-setup-report.md), add a row or short note for the new/changed contract.
- [ ] In PostHog UI, duplicate or adjust any insight that assumed category only changed from the sidebar (e.g. “Filter usage by type”).

**Ongoing:** [.cursor/rules/posthog-analytics.mdc](.cursor/rules/posthog-analytics.mdc) requires checking PostHog whenever product behavior or instrumentation changes.

## Risks / edge cases

- Stale slug in URL: keep current behavior; breadcrumb fallback if needed.
- `setCategoryFilter` already clears spec/variant filters — unchanged.

## Out of scope (unless requested later)

- Desktop-only second column for categories.
- Renaming PostHog project dashboards (manual in PostHog).
