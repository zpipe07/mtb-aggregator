---
name: Handle unavailable enriched products
overview: Detect out-of-stock products during JensonUSA enrichment and stop displaying them on the website. The JensonUSA PDP renders normally (HTTP 200) but shows "This item is unavailable." in the DOM. We need the enricher to detect this, propagate the signal through the API, set is_in_stock=false, and filter those listings from the public deals endpoint.
todos:
  - id: scraper-enrich-result
    content: Add `unavailable` boolean to EnrichResult interface in jensonusa.ts and detect "This item is unavailable" text in enrichJensonUSA
    status: completed
  - id: api-client-struct
    content: Add `Unavailable bool` field to Go EnrichResult struct in scraper/client.go
    status: completed
  - id: api-db-update
    content: Update UpdateListingEnrichment in db.go to accept unavailable flag and set is_in_stock=false when true
    status: completed
  - id: api-callers
    content: "Update all callers of UpdateListingEnrichment: scheduler.go (both enrichment jobs) and handlers.go (admin single enrich)"
    status: completed
  - id: api-deals-filter
    content: Add `AND l.is_in_stock = true` to the GetDeals query in db.go (public endpoint only, not admin)
    status: completed
isProject: false
---

# Handle Unavailable Products During Enrichment

## Problem

When enrichment runs on a product like `https://www.jensonusa.com/mondraker-foxy-bike`, the JensonUSA page returns HTTP 200 but displays **"This item is unavailable."** in the DOM. Currently:

1. The enricher returns `{ category_path: null, raw_specs: null }` with no unavailability signal
2. The API just stamps `last_enriched_at = NOW()` and moves on
3. `GET /deals` has no `is_in_stock` filter, so the stale deal keeps showing

## Changes

### 1. Scraper: Detect out-of-stock in JensonUSA enricher

**[apps/scraper/src/parsers/jensonusa.ts](apps/scraper/src/parsers/jensonusa.ts)** - Update the `EnrichResult` interface to include an optional `unavailable` flag:

```typescript
export interface EnrichResult {
  category_path: string[] | null;
  raw_specs: Record<string, string> | null;
  unavailable?: boolean;
}
```

In `enrichJensonUSA`, after `page.goto()` and the 3-second wait, check the DOM for the unavailability text before running the breadcrumb/spec extraction script. Early-return if the product is out of stock:

```typescript
const isUnavailable = await page.evaluate(() => {
  return document.body.innerText.includes("This item is unavailable");
});
if (isUnavailable) {
  console.log(`[scraper] jensonusa enrich: product unavailable ${productUrl}`);
  return { category_path: null, raw_specs: null, unavailable: true };
}
```

No changes to Worldwide Cyclery or Backcountry enrichers in this pass -- those can be handled later when we observe similar patterns on their sites.

### 2. API: Propagate `unavailable` and update `is_in_stock`

**[apps/api/internal/scraper/client.go](apps/api/internal/scraper/client.go)** - Add field to Go struct:

```go
type EnrichResult struct {
    CategoryPath []string          `json:"category_path"`
    RawSpecs     map[string]string `json:"raw_specs"`
    Unavailable  bool              `json:"unavailable"`
}
```

**[apps/api/internal/db/db.go](apps/api/internal/db/db.go)** - Update `UpdateListingEnrichment` to accept and handle the unavailable flag. When `unavailable` is true, set `is_in_stock = false` and `last_enriched_at = NOW()`, skipping the specs merge:

```go
func (db *DB) UpdateListingEnrichment(ctx context.Context, id int, categoryPath []string, rawSpecs map[string]string, unavailable bool) error {
    if unavailable {
        _, err := db.pool.Exec(ctx, `
            UPDATE store_listings
            SET is_in_stock = false, last_enriched_at = NOW()
            WHERE id = $1
        `, id)
        return err
    }
    // ... existing logic unchanged ...
}
```

**[apps/api/internal/scheduler/scheduler.go](apps/api/internal/scheduler/scheduler.go)** - Pass `result.Unavailable` to `UpdateListingEnrichment` in both `RunEnrichmentJob` (line 331) and `RunEnrichmentJobForStore` (line 434). Log when a listing is marked unavailable.

**[apps/api/internal/api/handlers.go](apps/api/internal/api/handlers.go)** - Update `PostAdminEnrichListing` (line 846) to pass the unavailable flag and include it in the JSON response so the admin UI reflects it.

### 3. API: Filter `GET /deals` by `is_in_stock`

**[apps/api/internal/db/db.go](apps/api/internal/db/db.go)** - Add `AND l.is_in_stock = true` to the `GetDeals` query (around line 464, after `WHERE 1=1`). This matches the existing pattern already used in `GetFacets` in [specs.go](apps/api/internal/db/specs.go). The admin `GetAdminListings` query should NOT be filtered so admins can still see unavailable products.
