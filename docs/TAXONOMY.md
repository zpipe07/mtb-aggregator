# Category Taxonomy System

How MTB categories are structured and mapped from store-specific paths to a canonical hierarchy.

## Components

### 1. Categories Table (Structured Tree)

- **Location**: `apps/api/internal/db/categories.go`
- **Table**: `categories` — id, slug, name, parent_id
- **Single source of truth** for the category hierarchy used by listings, mappings, and profiles

### 2. Category Mappings

- **Table**: `category_mappings`
- **Purpose**: Maps raw store category paths (e.g. `["Components", "Brakes"]`) to `category_id`
- **Seeded from**: `packages/shared/category_taxonomy.json` when empty
- **Caching**: In-memory cache in `internal/taxonomy/`
- **Match order**: Mappings load with `priority DESC`; `taxonomy.Map` takes the **first** substring match in that order. Put specific rules (e.g. eMTB vs generic electric) at **higher** priority than broad rules. After changing mappings in the DB, **restart the API** so the in-memory list reloads.

### 3. LLM-Driven Classification

- **Profiles**: `llm_prompt_profiles` define extraction schema (label, sort_order, filterable fields). Use `multi_enum` in `llm_extraction_field_defs` / profile fields when a spec should store multiple values (JSON array in `metadata.llm_specs`); filters still use a single selected value and match if it equals the scalar or appears in the array.
- **Classifier**: `llm_category_classifier` — optional LLM that picks a canonical path from the **structured `categories` tree** (valid paths are derived at runtime via `GetAllCategoryPaths`; new category rows are picked up automatically after migrate). Runs after enrichment and can override path-derived `canonical_category` when confidence ≥ `confidence_threshold`.
- **Spec filters**: LLM-driven per category; legacy `spec_filter_config` is deprecated

## Gear branch (wear / protect)

Under **Gear**, first-level children include Helmets, Shoes, **Eyewear** (Sunglasses, Goggles), Gloves, Protection, and Clothing. Migration `027` added Eyewear with high-priority mappings for store paths containing goggle/sunglass/eyewear keywords, plus a product-name backfill for misfiled listings.

## Data Flow

1. **Enrichment**: Scraper returns `category_path` (breadcrumb array) from PDP.
2. **Path-based taxonomy**: `taxonomy.Map` derives a candidate `canonical_category` and `category_id` from mappings — **unless** `metadata.llm_category` already records a confident prior classification (`confidence` ≥ threshold from `LLM_CATEGORY_PRESERVE_THRESHOLD` or the classifier row, default `0.5`), in which case only `category_path` is refreshed and LLM-owned `canonical_category` / `category_id` are preserved until the classifier runs again successfully.
3. **LLM classifier** (if enabled): Overwrites `canonical_category` / `category_id` when output confidence ≥ threshold; otherwise stores audit metadata only.
4. **Listing**: `store_listings.category_id` links to the canonical category row.

## Key Files

| Path | Purpose |
|------|---------|
| `packages/shared/category_taxonomy.json` | Seed data for mappings |
| `apps/api/internal/db/categories.go` | Category tree CRUD |
| `apps/api/internal/taxonomy/` | Mapping resolution, cache |

## Admin UI

- **CategoryManager**: Tree CRUD for `categories`
- **TaxonomyManager**: View/edit mappings
- **CategoryClassifierManager**: LLM classifier config
- **PromptProfileManager**: LLM extraction profiles per category

## Backfills

```bash
make backfill-canonical-categories   # Recategorize after taxonomy changes
make backfill-field-library          # After migration 019: LLM field defs + profile composition rows
```
