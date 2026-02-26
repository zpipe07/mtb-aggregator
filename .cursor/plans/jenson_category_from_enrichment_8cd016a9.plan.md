---
name: Jenson category from enrichment
overview: Stop deriving JensonUSA category from catalogNodeCodes in the scraper (which produces codes like C0000SA5) and rely on enrichment to set category_path from PDP breadcrumbs.
todos: []
isProject: false
---

# JensonUSA: Category from Enrichment Only

## Problem

Jenson deals often show bad categories (e.g. `C0000SA5`) because **category is derived from `catalogNodeCodes`** in the listing feed. In [apps/scraper/src/parsers/jensonusa-dto.ts](apps/scraper/src/parsers/jensonusa-dto.ts), `parseProductDto` calls `deriveCategory(dto.catalogNodeCodes, brand)` and sets `category_path = cat ? [cat] : null`. The `deriveCategory` logic filters out some code-like values (e.g. `C` + 7 digits) but values like `C0000SA5` can still slip through and become the single segment, so they get stored as the category.

## Why enrichment is the right source

- **Enrichment** for Jenson already exists and works: [apps/scraper/src/parsers/jensonusa.ts](apps/scraper/src/parsers/jensonusa.ts) defines `enrichJensonUSA`, which visits the product page and extracts **breadcrumbs** from the DOM (`nav[aria-label="Breadcrumb"]`) or LD+JSON `BreadcrumbList`. That yields human-readable paths (e.g. `["Mountain Bike", "Full Suspension"]`).
- The API’s `UpdateListingEnrichment` overwrites `category_path` with the enrichment result, and the upsert logic **already preserves** existing `category_path` when the scraped payload has null/empty category (see [apps/api/internal/db/db.go](apps/api/internal/db/db.go) line 179: `CASE WHEN EXCLUDED.category_path IS NOT NULL AND array_length(...) > 0 THEN EXCLUDED ... ELSE store_listings.category_path END`). So once we stop sending a category from the Jenson scraper, re-scrapes will no longer overwrite good enriched categories.

## Approach

1. **Scraper: stop using catalogNodeCodes for category**
   In [apps/scraper/src/parsers/jensonusa-dto.ts](apps/scraper/src/parsers/jensonusa-dto.ts):

- Set `category_path` to `null` for Jenson listings (do not call `deriveCategory` for the feed).
- Optionally remove or keep `deriveCategory` for possible reuse elsewhere; the minimal change is to stop using it here (e.g. always set `category_path = null` in `parseProductDto`).

1. **Existing bad data**
   Listings that already have bad `category_path` (e.g. `C0000SA5`) will be corrected when they are **re-enriched** (enrichment overwrites `category_path`). Options:

- Let the existing enrichment cron (and optional manual “Re-categorize all” / backfill) fix them over time, or
- One-time: trigger enrichment for Jenson listings (e.g. admin “Enrich” or `POST /enrich-now` and rely on the job to pick listings that need enrichment). No code change required for this; it’s operational.

1. **Tests**
   Update [apps/scraper/src/parsers/jensonusa-dto.test.ts](apps/scraper/src/parsers/jensonusa-dto.test.ts): any test that currently expects a category from `catalogNodeCodes` should expect `category_path: null` instead.

## Summary

| Source              | Before                                                  | After                                                 |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Scrape (feed)       | `category_path` from `deriveCategory(catalogNodeCodes)` | `category_path = null`                                |
| Enrichment (PDP)    | Overwrites `category_path` with breadcrumbs             | Unchanged                                             |
| Upsert on re-scrape | Could overwrite good category with bad feed category    | Keeps existing `category_path` when scrape sends null |

Result: new Jenson listings get category only after enrichment; re-scrapes no longer overwrite good categories with codes like `C0000SA5`.
