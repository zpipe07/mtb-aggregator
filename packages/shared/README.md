# Shared Package

Schema, migrations, seed data, and JSON config files shared across the mtb-aggregator monorepo.

## Contents

| Path | Purpose |
|------|---------|
| `schema.sql` | Base schema (stores, store_listings, price_history, etc.) |
| `seed.sql` | Seed data (stores: JensonUSA, Worldwide Cyclery, Revel, Ride Bicycles, Thunder Mountain Bikes, Competitive Cyclist, etc.) |
| `migrations/` | Numbered incremental migrations; run in sorted order |
| `brand_aliases.json` | Brand normalization; maps variants → canonical names (e.g. `santa cruz bicycles` → Santa Cruz, `sram` → SRAM). Copied into the API Docker image. |
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
- **giveaways** — Curated MTB giveaways and raffles (migration `049`). Unique `slug` and `entry_url`. Public list requires `published` and `ends_at` within 30 days; status is derived in the API, not stored.
- **store_listings** — Per-store listings (per variant for Shopify and JensonUSA clearance); `product_group_key` and `variant_options` JSONB for variant grouping/filters (migration `021`; Jenson uses parent product `code` as the group key). Migration `025` hides superseded Jenson parent-SKU rows after per-variant scraping. Migration `022` adds eMTB + mountain discipline / eMTB power-type subcategories and taxonomy mapping rows—**restart the API** after migrate so in-memory taxonomy reloads; run **`make backfill-canonical-categories`** to re-resolve listings into the new tree where mappings match. Migration **`027`** adds Gear → Eyewear (Sunglasses, Goggles) with mappings and product-name backfill. Migration **`036`** adds Components → Wheels/Tires → Tubeless with mappings and product-name backfill. Migration **`037`** flattens Gear → Clothing (Jerseys, Jackets, Shirts, Shorts, Pants, Socks as direct children; Tops/Bottoms removed) with leaf mappings and product-name backfill. Migration **`038`** adds Accessories → Pumps with mappings and product-name backfill. Migration **`039`** adds Bikes → BMX Bikes with mappings, product-name backfill, and `intended_use` enum extension (includes BMX).
- **categories** — Structured tree (id, slug, name, parent_id, optional `description` for LLM classification rubrics; migration `023`); single source of truth. Migration **`052`** adds Gear › **Helmet parts** (`gear-helmet-parts`) as a sibling of Helmets so replacement visors/liners/pads do not appear on the Helmets deals page (ZAC-246). Migration **`053`** adds `hide_from_nav` so admins can omit a shelf from the header mega-menu (Helmet parts is hidden from nav by default). Migration **`057`** (ZAC-271) renames Components › * › **Parts** to **`{Parent} parts`**, hides them from nav, and maps small hardware (fork seals, olives, hangers, …) off the complete-product leaves.
- **category_mappings** — Maps raw store category paths → `category_id`. Migration **`045`** narrows Accessories › Lights keywords (no bare `light`) so "Lightweight" marketing copy cannot dump complete bikes into Lights. Migration **`046`** maps store taxonomy **Full Suspension** / **Front Suspension** to Bikes (not Components › Suspension). Migration **`048`** maps `wheelset` / `bike wheels` to Complete wheels and `taxonomy.Map` prefers the most specific breadcrumb segment (ZAC-245). Migration **`052`** maps `helmet parts` / `helmet accessories` / `helmet visor` (and similar) to Helmet parts — not bare `helmet`. Migration **`057`** maps `fork seals` / `dust wiper` / `brake olive` / `derailleur hanger` / `headset spacer` (and similar) to the matching **`{Parent} parts`** leaf — not bare `fork` / `brake` / `headset`. Migration **`054`** maps `mountain bike clothing` / `skirt` / `men's liners` / `road bike tops` (and similar) to Gear › Clothing so Competitive Cyclist apparel breadcrumbs cannot land on Bikes (ZAC-264). Migration **`056`** keeps wheelsets/rims off Tires (ZAC-263): classifier rubrics, product-name backfill, and `taxonomy.RefineWheelsTires` at ingest/classify (`Wheelset` wins over `Tire Set`).
- **llm_extraction_field_defs** — Reusable LLM extraction field templates (`field_key`, `field_type`, `values`, etc.); merged with per-profile overrides at hydrate time (migration `019`). `field_type` includes `multi_enum` for array-of-enum outputs stored as JSON arrays under `metadata.llm_specs` (migration `020`). Migration **`050`** adds extractable **`bike_size`** on the Bikes parent profile (frame size facet + LLM extract; `make backfill-bike-size`). Migration **`051`** keeps it a scalar enum (not `multi_enum`) and expands values for road/gravel cm and BMX top-tube inches — inherited by Mountain, Road, Gravel, BMX, and the rest of the Bikes tree.
- **llm_prompt_profile_fields** — Ordered composition rows per `llm_prompt_profiles` row: library def + `overrides`, or `inline_field` for one-offs

## Config Files

- **brand_aliases.json** — Used by `internal/brand/` in the API for normalizing listing brands at scrape ingest. Lookup is case-insensitive, indexes canonical names, and retries after stripping suffixes such as Bicycles/Cycles/Inc. After adding aliases, run `make backfill-brands` or **Re-normalize brands** in the admin Normalization Manager so existing rows update.
- **category_taxonomy.json** — Bootstraps `category_mappings` when DB is empty; deprecated in favor of structured `categories` tree
