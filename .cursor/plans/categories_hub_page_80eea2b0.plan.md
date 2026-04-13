---
name: Categories Hub Page
overview: Add a lightweight `/categories` hub page that renders the full category tree with deal counts, plus a nav header link and sitemap entry. Reuses existing components (CategoryCard, tree utilities) and SEO infrastructure (categorySeo.ts).
todos:
  - id: create-page
    content: Create `apps/web/src/app/(public)/categories/page.tsx` server component with metadata, ISR, tree fetch, JSON-LD, and view render
    status: completed
  - id: create-view
    content: Create `apps/web/src/views/CategoriesPageContent.tsx` client view rendering grouped category tree with CategoryCard, deal counts, and SEO intro copy
    status: completed
  - id: extract-images
    content: Extract `CATEGORY_IMAGES` from HomePageContent to a shared location so both pages can use it
    status: completed
  - id: jsonld-builder
    content: Add `buildCollectionPageJsonLd` to `apps/web/src/lib/jsonLd.ts`
    status: completed
  - id: nav-link
    content: Add Categories link to `navLinks` in NavHeader.tsx
    status: completed
  - id: sitemap-entry
    content: Add `/categories` to static URLs in sitemap.ts
    status: completed
  - id: update-docs
    content: Update apps/web/README.md and docs/ARCHITECTURE.md with new route
    status: completed
isProject: false
---

# Categories Hub Page

## Direction

A server-rendered `/categories` page showing the full 3-level category tree, grouped by root. Each category links to its existing `/deals/c/[slug]` page. Deal counts per node create urgency signals. A nav link makes it discoverable. Structured data (`CollectionPage` JSON-LD) helps GEO.

This is Cluster A (#4) from the ideation: hub page with descriptions, plus a nav entry point.

## Key Files to Create

- `**[apps/web/src/app/(public)/categories/page.tsx](<apps/web/src/app/(public)`/categories/page.tsx>) -- Server component with metadata, fetches tree, renders view
- `**[apps/web/src/views/CategoriesPageContent.tsx](apps/web/src/views/CategoriesPageContent.tsx)` -- Client view rendering the full category tree

## Key Files to Modify

- `**[apps/web/src/components/NavHeader.tsx](apps/web/src/components/NavHeader.tsx)**` -- Add "Categories" nav link
- `**[apps/web/src/app/sitemap.ts](apps/web/src/app/sitemap.ts)**` -- Add `/categories` URL entry
- `**[apps/web/src/lib/jsonLd.ts](apps/web/src/lib/jsonLd.ts)**` -- Add `buildCollectionPageJsonLd` for the categories page

## Implementation Details

### 1. Server Page (`categories/page.tsx`)

Follow the pattern from `[apps/web/src/app/(public)/page.tsx](<apps/web/src/app/(public)`/page.tsx>):

- `export const revalidate = 60` (ISR, same as homepage)
- Static `metadata`: title "Mountain Bike Categories", description covering the scope, `alternates.canonical: "/categories"`, OG/Twitter with `absoluteUrl("/categories")`
- Fetch `fetchCategoryTree()` from `@/api`
- Render `CollectionPage` JSON-LD (new builder) + `<CategoriesPageContent tree={tree} />`

### 2. View Component (`CategoriesPageContent.tsx`)

Client component (`"use client"`) that renders the tree:

- **Layout:** For each root category (Bikes, Components, Gear, Accessories), render a section with:
  - Root heading (name) + deal count badge
  - Grid of `CategoryCard` for each child (and grandchild if present)
  - Each card shows: name, deal count in description, links to `buildDealsCategoryPath(slug, tree)`
- **Images:** Reuse `CATEGORY_IMAGES` map from `[HomePageContent.tsx](apps/web/src/views/HomePageContent.tsx)` (extract to shared constant or import). Root cards get images; subcategories are text-only cards.
- **Empty state:** Categories with `deal_count === 0` still appear but are visually muted (not hidden -- this is a discovery page, showing breadth matters)
- **SEO descriptions:** Use `getCategorySeo(slug).intro` for root category descriptions (already hand-tuned in `[categorySeo.ts](apps/web/src/lib/categorySeo.ts)`)

Visual structure:

```
[Page heading: "Browse Categories"]
[Brief intro line]

[Bikes section]
  [Root card with image + deal count]
  [Grid: Mountain, eMTB, Electric, Gravel, Road, Kids]
    [Mountain expands to show: XC, Trail, Enduro, Downhill, Dirt Jump, Fat Bike]
    [eMTB expands to show: Full Power, Lightweight]

[Components section]
  [Root card with image + deal count]
  [Grid: Drivetrain, Brakes, Suspension, Wheels, Cockpit]

[Gear section] ...
[Accessories section] ...
```

For depth-3 categories (e.g. bikes-mountain-trail), render them as a nested list or smaller chips under their parent card rather than separate full cards -- keeps the page scannable.

### 3. NavHeader Update

In `[NavHeader.tsx](apps/web/src/components/NavHeader.tsx)`, add to `navLinks`:

```typescript
const navLinks = [
  { href: "/", label: "Home", exact: true },
  { href: "/categories", label: "Categories", exact: true },
  { href: "/deals", label: "Deals", exact: false },
];
```

Use `exact: true` so only `/categories` highlights the link (not `/categories/anything`).

### 4. Sitemap Entry

In `[apps/web/src/app/sitemap.ts](apps/web/src/app/sitemap.ts)`, add `/categories` to the static URLs block:

```typescript
{ url: absoluteUrl("/categories"), lastModified: now, changeFrequency: "daily", priority: 0.8 }
```

### 5. JSON-LD (`CollectionPage`)

Add a `buildCollectionPageJsonLd` function to `[jsonLd.ts](apps/web/src/lib/jsonLd.ts)` that emits a `CollectionPage` schema with:

- `name`, `description`, `url` for the page
- `hasPart` array referencing each root category as a `CollectionPage` or `ItemList`

This gives AI engines a clean semantic map of the site's inventory scope.

### 6. PostHog Analytics

The existing `CategoryCard` already fires `category_clicked` with `{ category, href }` on click, so category engagement from this page is automatically tracked. No new events needed -- the existing event will naturally show a new `href` referrer pattern from `/categories`.

## Not Doing

- **Per-root landing pages** (`/categories/bikes`, etc.) -- fights with existing `/deals/c/bikes` routes, creates confusion
- **Featured deals per category on this page** -- that's what `/deals/c/[slug]` already does; keep the hub page focused on navigation
- **New category images** -- only 4 root images exist in `CATEGORY_IMAGES`; subcategories use text-only cards rather than adding placeholder imagery
- **Mega-menu** -- good idea for the future but separate scope; the nav link is sufficient for now
- **Description field from DB** -- the `description` column (migration 023) is for LLM classification hints and isn't exposed on the public `CategoryTreeNode` type; use `categorySeo.ts` intro copy instead

## Docs to Update

Per the documentation-sync rule:

- `[apps/web/README.md](apps/web/README.md)` -- add `/categories` to the routes list
- `[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)` -- mention categories hub in Web section if routes are listed there
