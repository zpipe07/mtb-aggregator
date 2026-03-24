---
name: Context-aware brand facets
overview: Replace the global brand list in the deals filter sidebar with context-aware brand facets from the /facets endpoint, so only brands matching the current category/filters are shown (with counts). Requires a small backend change to exclude the brand filter from brand facet computation.
todos:
  - id: backend-brand-facets
    content: Modify GetFacets in specs.go to compute brand facets with a separate WHERE clause that excludes the brand filter
    status: completed
  - id: frontend-deals-page
    content: Remove fetchBrands() from deals/page.tsx and stop passing brands prop
    status: completed
  - id: frontend-content
    content: Update DealsPageContent to derive brands from facets.brand_facets
    status: completed
  - id: frontend-sidebar
    content: Update FilterSidebar props from brands:string[] to brandFacets:BrandFacet[], show counts, handle selected-brand-not-in-facets edge case
    status: completed
  - id: frontend-drawer
    content: Update FilterDrawer to pass brandFacets prop through
    status: completed
  - id: verify-types
    content: Verify BrandFacet type exists in api.ts FacetsResponse
    status: completed
isProject: false
---

# Context-Aware Brand Facets

## Problem

The brand dropdown on `/deals` always shows every brand in the database regardless of selected category or other filters. This clutters the UI with irrelevant options.

## Solution

Use the existing `brand_facets` from `/facets` (already context-aware) instead of the global `/brands` list. One backend fix is needed: brand facets must be computed **excluding** the brand filter itself (standard faceted search pattern).

## Backend: Exclude brand from brand-facet WHERE clause

**File: [apps/api/internal/db/specs.go](apps/api/internal/db/specs.go)**

In `GetFacets` (~line 283), the brand facets query reuses `baseFrom` which includes the brand filter. When brand=Fox is active, brand_facets returns only Fox — preventing the user from switching brands.

**Change:** Build a separate `brandBaseFrom` by calling `buildFacetsWhereClause` with a copy of `params` where `Brand` is cleared:

```go
// Brand facets — exclude brand filter so users can see/switch alternatives
brandParams := params
brandParams.Brand = ""
brandWhere, brandArgs := buildFacetsWhereClause(brandParams, specFiltersForWhere, true)
if brandWhere == "" {
    brandWhere = " AND l.is_in_stock = true"
} else {
    brandWhere = " AND l.is_in_stock = true" + brandWhere
}
brandBaseFrom := `
    FROM store_listings l
    JOIN stores s ON s.id = l.store_id
    WHERE 1=1` + brandWhere

brandQuery := `
    SELECT l.brand, COUNT(*) as cnt
    ` + brandBaseFrom + `
    AND l.brand IS NOT NULL AND trim(l.brand) <> ''
    GROUP BY l.brand
    ORDER BY cnt DESC
    LIMIT 50`
rows2, err := db.pool.Query(ctx, brandQuery, brandArgs...)
```

## Frontend: Use brand_facets instead of global brands

### 1. Remove `fetchBrands()` from deals page

**File: [apps/web/src/app/(public)/deals/page.tsx](apps/web/src/app/(public)**/deals/page.tsx)

- Remove `fetchBrands` from the import and `Promise.all` (line 69)
- Remove `brands` prop from `DealsPageContent`

### 2. Update `DealsPageContent` to derive brands from facets

**File: [apps/web/src/views/DealsPageContent.tsx](apps/web/src/views/DealsPageContent.tsx)**

- Remove `brands: string[]` from Props
- Derive brand options from `facets.brand_facets`:

```typescript
const brandFacets = facets.brand_facets ?? [];
```

- Pass `brandFacets` (typed as `BrandFacet[]`) to `FilterSidebar` instead of `brands`

### 3. Update `FilterSidebar` to accept `BrandFacet[]` with counts

**File: [apps/web/src/components/FilterSidebar.tsx](apps/web/src/components/FilterSidebar.tsx)**

- Change `brands: string[]` prop to `brandFacets: BrandFacet[]` (import `BrandFacet` from `../api`)
- Build options showing counts (consistent with how spec facets display):

```typescript
const brandOptions = [
  { value: "", label: "All brands" },
  ...brandFacets.map((b) => ({
    value: b.value,
    label: `${b.value} (${b.count})`,
  })),
];
```

- Safety: if `brandFilter` is set but not present in `brandFacets` (edge case — e.g. user bookmarked a URL with a brand that no longer matches), ensure the selected brand still appears in the list so the user can deselect it.

### 4. Update `FilterDrawer` if it also passes brands

**File: [apps/web/src/components/FilterDrawer.tsx](apps/web/src/components/FilterDrawer.tsx)**

- Ensure it passes through `brandFacets` (same prop rename as FilterSidebar).

### 5. Verify `BrandFacet` type exists in API types

**File: [apps/web/src/api.ts](apps/web/src/api.ts)**

- Confirm `BrandFacet` type (`{ value: string; count: number }`) is already defined in `FacetsResponse`. If not, add it.

## Edge Cases

- **Selected brand not in facets**: If the user has `brand=X` in the URL but X has 0 results for the current category, it won't appear in brand_facets. We should inject it into the options (with count 0) so the user can deselect it.
- **LIMIT 50 on brand facets**: Already capped at 50 brands. This is reasonable but worth noting — stores with 50+ active brands in a category would see a truncated list.
- **No regression on `/brands` endpoint**: The global `GET /brands` endpoint is untouched; other consumers (if any) are unaffected.
