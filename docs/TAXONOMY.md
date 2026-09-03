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
- **Match order**: Mappings load with `priority DESC`. `taxonomy.Map` tries **breadcrumb segments from right to left** (most specific leaf first) so an ancestor like `Cycling Gear` cannot beat `Gravel Bike Wheels and Wheelsets` (ZAC-245). Within a segment, the **first** substring match in mapping order wins. Put specific rules (e.g. wheelset vs generic bike, eMTB vs generic electric) at **higher** priority than broad rules. After changing mappings in the DB, **restart the API** so the in-memory list reloads.

### 3. LLM-Driven Classification

- **Profiles**: `llm_prompt_profiles` define extraction schema (label, sort_order, filterable fields). Use `multi_enum` in `llm_extraction_field_defs` / profile fields when a spec should store multiple values (JSON array in `metadata.llm_specs`); filters still use a single selected value and match if it equals the scalar or appears in the array. **`clothing_size`** is not LLM-extracted: the API normalizes `variant_options.Size` into `metadata.llm_specs.clothing_size` for Helmets, Clothing, and inherited apparel leaves. **`bike_size`** (migrations `050`/`051`) is a **scalar** LLM-extractable enum on the **Bikes** parent profile (inherited by Mountain, Road, Gravel, BMX, eMTB, Frames, Kids): letter sizes, Specialized S1–S6, MTB inches, road/gravel **cm** (`58cm`), or BMX **top-tube** inches (`21.5`) — never wheel size. It is not `multi_enum`: one size per listing row; in-stock size sets stay on variant chips. A grouped `/deals` filter still matches if any sibling row has that size. Variant `Size` / `Bike Size` / `Frame Size` is also copied into `llm_specs.bike_size` on scrape ingest so `/deals` `spec_bike_size` filters work before the next LLM pass (`make backfill-bike-size`). **Helmets** use a dedicated system prompt and `coverage` enum rubric (Half shell / 3/4 shell / Full face / Convertible) plus a helmet-specific **`intended_use`** override (`multi_enum`, DH not Downhill).
- **Classifier**: `llm_category_classifier` — optional LLM that picks a canonical path from the **structured `categories` tree** (valid paths are derived at runtime via `GetAllCategoryPaths`; new category rows are picked up automatically after migrate). Runs after enrichment and can override path-derived `canonical_category` when confidence ≥ `confidence_threshold`.
- **Spec filters**: LLM-driven per category; legacy `spec_filter_config` is deprecated

## Gear branch (wear / protect)

Under **Gear**, first-level children include Helmets, Shoes, **Eyewear** (Sunglasses, Goggles), Gloves, Protection, and Clothing. Migration `027` added Eyewear with high-priority mappings for store paths containing goggle/sunglass/eyewear keywords, plus a product-name backfill for misfiled listings.

Under **Gear → Clothing**, Jerseys, Jackets, Shirts, Shorts, Pants, and Socks are **direct leaves** (migration `037` removed the intermediate Tops/Bottoms layer so mega-menu browse matches shoppable shelves). High-priority leaf mappings classify store paths and product names into the specific apparel type.

**Bikes Online combined product_type:** Shopify sale rows use `product_type` `Clothing & Protective Gear` for both apparel and protective gear (pads, helmets, gloves). Substring mapping hits `clothing` first, so path-based canonical lands on **Gear > Clothing** even for knee sleeves. Do **not** add a blanket `protective gear` mapping — it would misfile jerseys in the same bucket. After LLM classification (Protection / Helmets / Gloves at ≥ classifier threshold), run `make backfill-bikesonline-clothing-protective` to copy the live LLM path onto `canonical_category`, then rely on PDP preserve + recategorize skip (confident `metadata.llm_category`) so the column is not remapped back to Clothing.

Under **Components → Drivetrain**, **Bottom Brackets** is a dedicated leaf (migration `032`) with high-priority mappings for bottom-bracket keywords and LLM extraction of `bb_standard` / `bb_shell_width` for facet filters. Under **Components → Cockpit**, **Headsets** is a dedicated leaf with mappings for headset keywords and `headset_standard` extraction. Spacers, stem caps, and install tools stay in Cockpit Parts or Accessories → Tools.

Under **Components → Wheels/Tires**, **Tubeless** is a dedicated leaf (migration `036`) for valves, rim tape, sealant, kits, and tire inserts. Mappings use **specific** keywords (`tubeless valve`, `rim tape`, `tire sealant`, etc.) — not bare `tubeless`, which would misclassify tubeless-ready tires. The legacy `tube`/`tubes` mapping is substring-based, so paths like `Tubeless Kits` previously landed in **Tubes** until the high-priority Tubeless rule runs first.

Under **Accessories**, **Pumps** is a dedicated leaf (migration `038`) for floor, mini/hand, frame, shock/fork, electric pumps, and CO2 inflators. Mappings use **specific** keywords (`floor pump`, `shock pump`, `mini pump`, etc.) — not bare `pump`, which would misclassify pump parts, pump-track bikes, and saddles. Pump parts and rebuild kits stay in **Components** or **Tools**.

Under **Accessories → Lights**, mappings use **specific** keywords (`lights`, `bike light`, `headlight`, `taillight`, `lamp`, etc.) — not bare `light` (migration `045`). A Bikes Online collection H1 containing **Lightweight** previously substring-matched `light` at priority 9 and dumped complete bikes (and a scooter/charger) into Lights (ZAC-234). Shopify breadcrumb fallback also rejects sentence-length marketing copy so that H1 cannot become `category_path`. After applying `045`, **restart the API** so in-memory mappings reload; then remapping / LLM classify for Bikes Online (recategorize skips confident `metadata.llm_category` and `manual_category_override`).

**Complete bikes vs Components → Suspension:** Shopify `product_type` values like **Full Suspension** (Cambria, Colorado Cyclist) and **Front Suspension** (Mack Cycle hardtails) substring-match bare `suspension` at priority 37 and beat the legacy `full suspension` keyword on the Mountain Bikes catch-all (priority 4). Migration `046` adds higher-priority `full suspension` / `front suspension` → **Bikes › Mountain Bikes** and `full suspension frames` → **Bikes › Frames**, tied with Forks at 38 so “Front Suspension Forks” still lands on Forks. Same class of bug as bare `light` / `pump` / `tubeless` / `bmx`. After applying `046`, **restart the API** and run **`make backfill-canonical-categories`** (skips `manual_category_override` and confident `llm_category`).

**Most specific breadcrumb (ZAC-245):** Store paths go general → specific. Joining the whole path let high-priority keywords in ancestors (`bike` in `Bike Parts`, or `gear` in `Cycling Gear`) win before `wheels` / `wheelset` on the leaf. `taxonomy.Map` now matches the rightmost segment first and falls back toward the root. Migration `048` adds high-priority `wheelset` / `bike wheels` / `complete wheels` → **Components › Wheels/Tires › Complete wheels** so a leaf like `Gravel Bike Wheels and Wheelsets` is not classified as Bikes (generic `bike`) or Gear. After applying `048`, **restart the API** and run **`make backfill-canonical-categories`**.

Under **Bikes**, **BMX Bikes** is a dedicated leaf (migration `039`) for complete BMX bicycles. Mappings use **specific** keywords (`bmx bike`, `complete bmx`, `freestyle bmx`, `bmx / dirt jump`, etc.) — not bare `bmx`, which would misclassify BMX stems, helmets, and tires. Dirt-jump MTB hardtails stay under **Mountain > Dirt Jump**; youth balance/MTB bikes stay under **Kids**; BMX frames sold alone stay under **Frames**. BMX parts and gear remain in **Components** / **Gear** and can be tagged with `intended_use = BMX` after migration `039` extends the shared enum.

## Data Flow

1. **Enrichment**: Scraper returns `category_path` (breadcrumb array) from PDP.
2. **Path-based taxonomy**: `taxonomy.Map` derives a candidate `canonical_category` and `category_id` from mappings by matching the **most specific** `category_path` segment first — **unless** `metadata.llm_category` already records a confident prior classification (`confidence` ≥ threshold from `LLM_CATEGORY_PRESERVE_THRESHOLD` or the classifier row, default `0.5`), in which case only `category_path` is refreshed and LLM-owned `canonical_category` / `category_id` are preserved until the classifier runs again successfully. Admin **Recategorize** / `make backfill-canonical-categories` skips listings with `manual_category_override` or the same confident `llm_category` threshold so path remap cannot undo LLM-owned categories.
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
make backfill-bikesonline-clothing-protective   # Bikes Online Clothing & Protective Gear → LLM Protection/Helmets/Gloves (DRY_RUN=1 preview)
make backfill-field-library          # After migration 019: LLM field defs + profile composition rows
```
