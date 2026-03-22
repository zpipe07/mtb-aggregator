---
name: Ride Bicycles min discount
overview: Filter Ride Bicycles scrape results so only variants with at least 10% off MSRP (compare-at) are emitted; document the behavior. Existing DB rows with tiny discounts are not removed automatically.
todos:
  - id: filter-parser
    content: Add MIN_DISCOUNT_FRACTION (0.1) check in ridebicycles.ts variant loop after compare-at validation
    status: completed
  - id: docs
    content: Update docs/SCRAPING.md and apps/scraper/README.md for Ride Bicycles ≥10% rule
    status: completed
isProject: false
---

# Minimum 10% discount for Ride Bicycles scrapes

## Current behavior

In `[apps/scraper/src/parsers/ridebicycles.ts](apps/scraper/src/parsers/ridebicycles.ts)`, each variant is kept only if:

- `variant.available`
- `compare_at_price` parses to a finite value **strictly greater than** `current` (lines 102–112)

So any markdown counts as a “deal,” including a few cents. The Shopify `products.json` API ignores collection URL filters like `rb_discount_relative` (already documented in `[docs/SCRAPING.md](docs/SCRAPING.md)`), so the parser must enforce business rules.

## Implementation

**Single change site (scraper):** After validating `compareAtPrice > currentPrice`, compute discount as:

`(compareAtPrice - currentPrice) / compareAtPrice`

Skip the variant unless this ratio is **≥ 0.1** (10% off). Equivalently: `currentPrice <= compareAtPrice * 0.9` (strict equality at exactly 10% off should **include** the listing).

Add a small named constant at the top of the file (e.g. `MIN_DISCOUNT_FRACTION = 0.1`) so the threshold is obvious and easy to tune.

**Why not the Go API:** `[apps/api/internal/scraper/validate.go](apps/api/internal/scraper/validate.go)` does not receive `store_type` in `ValidateResult`, and adding a global “min discount” would affect all stores. Keeping the rule in the Ride Bicycles parser matches the request and avoids cross-store side effects.

## Documentation

Per workspace doc-sync rules, update the Ride Bicycles bullet in:

- `[docs/SCRAPING.md](docs/SCRAPING.md)` — note **≥10% off compare-at** in addition to in-stock + discounted.
- `[apps/scraper/README.md](apps/scraper/README.md)` — same one-line clarification on the `ridebicycles` parser.

## Existing data caveat

Scrape jobs **upsert** listings returned by the scraper; they do **not** delete rows for SKUs that disappear from the next batch. After this change, tiny-discount products will stop being re-upserted, but **already-saved** few-cent “deals” can remain until you run a one-time SQL cleanup or remove them via admin—call that out only if you want to purge history (optional follow-up, not required for the scraper change).

## Tests

There is no `ridebicycles.test.ts` today. Optional: add a tiny unit test that feeds a mock variant object through a shared helper (e.g. `isRideBicyclesDealVariant`) with cases at 9.9% vs 10% vs 25% off—only if you want regression coverage; the logic is a few lines.
