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

### 3. LLM-Driven Classification

- **Profiles**: `llm_prompt_profiles` define extraction schema (label, sort_order, filterable fields)
- **Classifier**: `llm_category_classifier` — optional LLM-based classification when no mapping exists
- **Spec filters**: LLM-driven per category; legacy `spec_filter_config` is deprecated

## Data Flow

1. **Enrichment**: Scraper returns `category_path` (breadcrumb array) from PDP
2. **Mapping lookup**: Taxonomy finds `category_id` via `category_mappings`
3. **Fallback**: If no mapping, LLM classifier can suggest a category
4. **Listing**: `store_listings.category_id` links to canonical category

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
