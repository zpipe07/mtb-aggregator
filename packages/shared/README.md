# Shared Package

Schema, migrations, seed data, and JSON config files shared across the mtb-aggregator monorepo.

## Contents

| Path | Purpose |
|------|---------|
| `schema.sql` | Base schema (stores, store_listings, price_history, etc.) |
| `seed.sql` | Seed data (stores) |
| `migrations/` | Numbered incremental migrations; run in sorted order |
| `brand_aliases.json` | Brand normalization; maps variants → canonical names |
| `category_taxonomy.json` | Legacy category tree; used for seed when `category_mappings` empty |

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
- **store_listings** — Per-store listings; `category_path` from scraper or enricher; `category_id` FK to structured tree
- **categories** — Structured tree (id, slug, name, parent_id); single source of truth
- **category_mappings** — Maps raw store category paths → `category_id`

## Config Files

- **brand_aliases.json** — Used by `internal/brand/` in the API for normalizing listing brands
- **category_taxonomy.json** — Bootstraps `category_mappings` when DB is empty; deprecated in favor of structured `categories` tree
