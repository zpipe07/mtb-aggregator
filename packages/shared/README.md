# Shared Package

Schema, migrations, seed data, and JSON config files shared across the mtb-aggregator monorepo.

## Contents

| Path | Purpose |
|------|---------|
| `schema.sql` | Base schema (stores, store_listings, price_history, etc.) |
| `seed.sql` | Seed data (stores: JensonUSA, Worldwide Cyclery, Revel, Ride Bicycles, Thunder Mountain Bikes, Competitive Cyclist, etc.) |
| `migrations/` | Numbered incremental migrations; run in sorted order |
| `brand_aliases.json` | Brand normalization; maps variants → canonical names |
| `category_taxonomy.json` | Legacy category tree; used for seed when `category_mappings` empty |
| `categories.export.json` | Point-in-time export of live `categories` rows from Neon (regenerate when taxonomy changes). Used by the web app [`apps/web/src/lib/categorySeo.ts`](../../apps/web/src/lib/categorySeo.ts) for category-page titles/descriptions; also useful for comparing taxonomy locally. |
| `llm_prompt_profiles.export.json` | Optional point-in-time export of live `llm_prompt_profiles` rows (not loaded by the app) |

## Database Setup

**Initial (fresh DB):**
```bash
make db-migrate       # Apply schema (Docker)
make db-seed         # Seed stores
```

**Incremental migrations:**
```bash
make db-migrate-docker   # Local Docker
make db-migrate-remote   # Remote (Neon, etc.)
```

See [migrations/README.md](migrations/README.md) for migration conventions.

## Schema Overview

- **stores** — Retailers; `store_type` determines which scraper parser to use
- **store_listings** — Per-store listings (per variant for Shopify and JensonUSA clearance); `product_group_key` and `variant_options` JSONB for variant grouping/filters (migration `021`; Jenson uses parent product `code` as the group key). Migration `025` hides superseded Jenson parent-SKU rows after per-variant scraping. Migration `022` adds eMTB + mountain discipline / eMTB power-type subcategories and taxonomy mapping rows—**restart the API** after migrate so in-memory taxonomy reloads; run **`make backfill-canonical-categories`** to re-resolve listings into the new tree where mappings match. Migration **`027`** adds Gear → Eyewear (Sunglasses, Goggles) with mappings and product-name backfill.
- **categories** — Structured tree (id, slug, name, parent_id, optional `description` for LLM classification rubrics; migration `023`); single source of truth
- **category_mappings** — Maps raw store category paths → `category_id`
- **llm_extraction_field_defs** — Reusable LLM extraction field templates (`field_key`, `field_type`, `values`, etc.); merged with per-profile overrides at hydrate time (migration `019`). `field_type` includes `multi_enum` for array-of-enum outputs stored as JSON arrays under `metadata.llm_specs` (migration `020`)
- **llm_prompt_profile_fields** — Ordered composition rows per `llm_prompt_profiles` row: library def + `overrides`, or `inline_field` for one-offs

## Config Files

- **brand_aliases.json** — Used by `internal/brand/` in the API for normalizing listing brands
- **category_taxonomy.json** — Bootstraps `category_mappings` when DB is empty; deprecated in favor of structured `categories` tree
