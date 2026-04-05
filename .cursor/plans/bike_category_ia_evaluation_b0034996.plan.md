---
name: Bike Category IA Evaluation
overview: Restructure the Bikes category hierarchy to promote discipline-level subcategories into crawlable pages, add a new Electric Mountain Bikes category distinct from Electric, include deal counts on the category tree so empty categories are hidden from nav/sitemap, and fix the slug-to-URL mapping for multi-word category names.
todos:
  - id: audit-inventory
    content: Audit listing counts per intended_use value to validate subcategory inventory
    status: pending
  - id: fix-slug-url-mapping
    content: Refactor buildDealsCategoryPath to derive URL segments from the tree instead of naive hyphen-splitting, so multi-word slugs like bikes-mountain-dirt-jump produce /deals/c/bikes/mountain/dirt-jump
    status: completed
  - id: deal-counts-on-tree
    content: Add deal_count (including subtree rollup) to GET /categories/tree; frontend and sitemap filter out categories with 0 deals
    status: completed
  - id: migration-new-categories
    content: Create DB migration adding bikes-emtb (Electric Mountain Bikes) + depth-2 subcategories under bikes-mountain and bikes-emtb
    status: pending
  - id: taxonomy-mappings
    content: Update category_taxonomy.json with granular keyword mappings for new subcategories
    status: pending
  - id: category-seo-metadata
    content: Add targeted titles, descriptions, and intro copy in categorySeo.ts for each new subcategory
    status: pending
  - id: recategorize-listings
    content: Re-categorize existing listings using intended_use spec data + backfill
    status: pending
  - id: nav-internal-linking
    content: Update DealsCategoryNav, home page cards, and hub pages for 3-level navigation
    status: pending
isProject: false
---

# Bike Category Information Architecture: SEO/GEO Evaluation and Plan

## Current State

### URL structure today

```
/deals/c/bikes                  (all bikes)
/deals/c/bikes/mountain         (all MTBs: XC, trail, enduro, DH, etc.)
/deals/c/bikes/electric         (all e-bikes)
/deals/c/bikes/gravel
/deals/c/bikes/road
/deals/c/bikes/kids
/deals/c/bikes/frames
```

Each is a **server-rendered page** with unique metadata, JSON-LD (`ItemList`), sitemap entry, and hand-tuned intro copy via [categorySeo.ts](apps/web/src/lib/categorySeo.ts). Routing: catch-all `[...slug]` at [deals/c/[...slug]/page.tsx](<apps/web/src/app/(public)/deals/c/%5B...slug%5D/page.tsx>).

### How discipline filtering works today

"Intended use" (XC, Trail, Enduro, etc.) is an **LLM-extracted spec** in `metadata.llm_specs.intended_use`. It surfaces as a **query-string facet**:

```
/deals/c/bikes/mountain?spec_intended_use=XC
```

### The SEO/GEO problem

**Query-string filters are effectively invisible to search engines:**

1. **Canonical tags strip them.** `generateMetadata` sets `canonical: pathname` (no query params). `/deals/c/bikes/mountain?spec_intended_use=XC` canonicalizes to `/deals/c/bikes/mountain`.
2. **Sitemap excludes them.** [sitemap.ts](apps/web/src/app/sitemap.ts) emits category paths from the tree only.
3. **No discoverable internal links.** Filter links are generated client-side via `router.replace` -- no `<a href>` for crawlers to follow.

**GEO impact:** AI search engines build topic understanding from dedicated, well-structured pages. A page canonically titled "XC Mountain Bike Deals" with unique description, intro copy, and schema markup is far more likely to be cited than a generic "mountain bike deals" page that happens to have a filter sidebar.

**Bottom line:** The site competes for "enduro bike deals", "XC mountain bike deals", "full power eMTB deals" etc. with a **single** `/deals/c/bikes/mountain` page rather than dedicated pages. Competitors with distinct category pages for those terms have a structural SEO advantage.

---

## Revised Category Hierarchy

Based on clarifications: "Electric Mountain Bikes" is **separate from** "Electric" (which covers all e-bikes). Gravel/Road/Kids stay at current depth. All subcategories are created in the DB but **only exposed in nav/sitemap when they have deals**.

```
Bikes
├── Mountain Bikes          (slug: bikes-mountain, existing)
│   ├── XC                  (slug: bikes-mountain-xc)
│   ├── Trail               (slug: bikes-mountain-trail)
│   ├── Enduro              (slug: bikes-mountain-enduro)
│   ├── Downhill            (slug: bikes-mountain-downhill)
│   ├── Dirt Jump           (slug: bikes-mountain-dirt-jump)
│   └── Fat Bike            (slug: bikes-mountain-fat-bike)
├── Electric Mountain Bikes (slug: bikes-emtb, NEW sibling)
│   ├── Full Power          (slug: bikes-emtb-full-power)
│   └── Lightweight         (slug: bikes-emtb-lightweight)
├── Electric                (slug: bikes-electric, existing -- all non-MTB e-bikes)
├── Gravel                  (slug: bikes-gravel, unchanged)
├── Road                    (slug: bikes-road, unchanged)
├── Kids                    (slug: bikes-kids, unchanged)
└── Frames                  (slug: bikes-frames, unchanged)
```

### Resulting URLs

```
/deals/c/bikes/mountain                → all mountain bikes (hub page)
/deals/c/bikes/mountain/xc            → "XC Mountain Bike Deals"
/deals/c/bikes/mountain/trail          → "Trail Mountain Bike Deals"
/deals/c/bikes/mountain/enduro         → "Enduro Mountain Bike Deals"
/deals/c/bikes/mountain/downhill       → "Downhill Mountain Bike Deals"
/deals/c/bikes/mountain/dirt-jump      → "Dirt Jump Bike Deals"
/deals/c/bikes/mountain/fat-bike       → "Fat Bike Deals"
/deals/c/bikes/emtb                    → "Electric Mountain Bike Deals" (hub)
/deals/c/bikes/emtb/full-power        → "Full Power eMTB Deals"
/deals/c/bikes/emtb/lightweight       → "Lightweight eMTB Deals"
/deals/c/bikes/electric               → "Electric Bike Deals" (non-MTB)
```

### Naming: display labels vs SEO titles

- DB `name` / nav label: "Mountain Bikes", "Electric Mountain Bikes"
- [categorySeo.ts](apps/web/src/lib/categorySeo.ts) `title`: "Mountain Bike Deals", "Electric Mountain Bike Deals", etc.
- Slug used for URL generation is independent of both -- SEO-optimized titles are set in `categorySeo.ts`, not derived from the slug

---

## Technical Issue: Slug-to-URL Mapping

### The problem

[dealsCategoryPath.ts](apps/web/src/lib/dealsCategoryPath.ts) line 9 builds URLs by naive hyphen-split:

```ts
return `${DEALS_CATEGORY_PREFIX}/${s.split("-").join("/")}`;
```

This breaks for multi-word category names:

- `bikes-mountain-dirt-jump` would produce `/deals/c/bikes/mountain/dirt/jump` (4 segments, looks like 4 levels)
- `bikes-emtb-full-power` would produce `/deals/c/bikes/emtb/full/power` (wrong)

### The fix

**Parse direction (URL to slug) already works correctly** -- `segments.join("-")` at line 35 produces the right slug regardless of hyphens within segments.

**Build direction needs the tree.** Instead of splitting on hyphens, derive each URL segment by walking from the tree root to the node. For a node with slug `bikes-mountain-dirt-jump` whose parent is `bikes-mountain`:

- Segment = `slug.slice(parentSlug.length + 1)` = `dirt-jump`
- URL = `/deals/c/bikes/mountain/dirt-jump`

Change `buildDealsCategoryPath` to accept the tree (or a precomputed slug-to-segments map) and walk ancestors. All call sites already have access to the tree:

- [allDealsCategoryPathsFromTree](apps/web/src/lib/dealsCategoryPath.ts) -- walks the tree, can accumulate path segments
- [DealsCategoryNav](apps/web/src/components/DealsCategoryNav.tsx) -- has `categoryTree` prop
- [sitemap.ts](apps/web/src/app/sitemap.ts) -- fetches the tree
- [buildDealsBrowseHref](apps/web/src/lib/dealsBrowseHref.ts) -- needs tree passed or a lookup

Backward compatible: existing two-level slugs like `bikes-mountain` still produce `/deals/c/bikes/mountain` (segment = `mountain`).

---

## Dynamic Category Visibility (Deal Counts)

### Goal

Only expose categories in nav, home page cards, and sitemap **when they have deals**. This prevents thin/empty pages from appearing in search indexes and avoids misleading users.

### Implementation

**API: add `deal_count` to `/categories/tree` response**

- Extend `CategoryTreeNode` in [categories.go](apps/api/internal/db/categories.go) with `DealCount int`
- Query: `LEFT JOIN` a subquery counting in-stock `store_listings` per `category_id`, then **roll up** subtree counts (a parent's count includes all descendants)
- The existing `GetCategorySubtreeIDs` recursive CTE pattern can be reused

**Frontend: filter by count**

- [DealsCategoryNav](apps/web/src/components/DealsCategoryNav.tsx): only render chip/link for nodes where `deal_count > 0`
- Home page category cards: same filter
- [sitemap.ts](apps/web/src/app/sitemap.ts): skip categories with `deal_count === 0`

**SEO for empty category pages**

- If a user navigates directly to an empty category URL, render a "no deals found" message with a link to the parent
- Set `robots: { index: false }` in `generateMetadata` when the category has 0 deals, so search engines don't index empty pages

---

## Implementation Phases

### Phase 0: Fix slug-to-URL mapping

- Refactor `buildDealsCategoryPath` in [dealsCategoryPath.ts](apps/web/src/lib/dealsCategoryPath.ts) to derive URL segments from tree ancestry
- Update all call sites to pass tree data
- No DB or API changes; existing categories continue to work

### Phase 1: Deal counts on category tree

- Extend `CategoryTreeNode` in [categories.go](apps/api/internal/db/categories.go) with `deal_count`
- Update `ListCategoriesTree` query to include counts with subtree rollup
- Update `CategoryTreeNode` TypeScript type in [api.ts](apps/web/src/api.ts)
- Filter nav, home cards, and sitemap by `deal_count > 0`
- Add `noindex` to empty category pages in `generateMetadata`

### Phase 2: Extend the category tree (DB + API)

- New migration adding:
  - `bikes-emtb` ("Electric Mountain Bikes") as sibling of `bikes-mountain` and `bikes-electric`
  - Depth-2 children under `bikes-mountain`: xc, trail, enduro, downhill, dirt-jump, fat-bike
  - Depth-2 children under `bikes-emtb`: full-power, lightweight
- Update [category_taxonomy.json](packages/shared/category_taxonomy.json) with granular keyword mappings (e.g. `"xc bike"` -> `["Bikes", "Mountain Bikes", "XC"]`, `"electric mountain bike"` -> `["Bikes", "Electric Mountain Bikes"]`)
- Update LLM classifier valid categories

### Phase 3: SEO metadata for new subcategories

- Add entries to `HAND_TUNED` in [categorySeo.ts](apps/web/src/lib/categorySeo.ts) with targeted titles, descriptions, and intro copy for each new subcategory
- JSON-LD `ItemList` already emits automatically for any category page

### Phase 4: Re-categorize existing listings

- Listings currently under `bikes-mountain` need splitting into XC/Trail/Enduro/etc.
- Strategy: use existing `metadata.llm_specs.intended_use` data to drive re-categorization
- `bikes-electric` listings that are mountain bikes need moving to `bikes-emtb`
- Run `make backfill-canonical-categories` after mapping updates

### Phase 5: Navigation and internal linking

- [DealsCategoryNav](apps/web/src/components/DealsCategoryNav.tsx) breadcrumbs and chips already handle arbitrary depth (tree walk in `findCategoryWithAncestors` / `getBrowseChipNodes`)
- Verify 3-level breadcrumb rendering looks correct
- Consider hiding `spec_intended_use` filter on leaf discipline pages (XC, Trail, etc.) where it's redundant
- Update home page category cards if popular subcategories should be featured directly
