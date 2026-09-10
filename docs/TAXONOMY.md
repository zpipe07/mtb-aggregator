# Category Taxonomy System

How MTB categories are structured and mapped from store-specific paths to a canonical hierarchy.

## Components

### 1. Categories Table (Structured Tree)

- **Location**: `apps/api/internal/db/categories.go`
- **Table**: `categories` — id, slug, name, parent_id, optional `description`, `hide_from_nav` (migration `053`)
- **Single source of truth** for the category hierarchy used by listings, mappings, and profiles
- **`hide_from_nav`**: when true, the node (and its descendants) is omitted from the header CATEGORIES mega-menu. Products stay categorized there and the node still appears on `/categories`. Editable in admin CategoryManager. **Helmet parts** and **Components › * › {Parent} parts** (migration `057` / ZAC-271) are hidden from nav by default.

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

Under **Gear**, first-level children include Helmets, **Helmet parts**, Shoes, **Eyewear** (Sunglasses, Goggles), Gloves, Protection, and Clothing. Migration `027` added Eyewear with high-priority mappings for store paths containing goggle/sunglass/eyewear keywords, plus a product-name backfill for misfiled listings.

**Helmets vs Helmet parts (ZAC-246):** `/deals?category_slug=gear-helmets` includes the Helmets subtree only. Replacement visors, liners, cheek pads, and pad kits are a **sibling** (`gear-helmet-parts`) so cheap accessories do not sort to the top of the helmets page. Mappings use **specific** keywords (`helmet parts`, `helmet accessories`, `helmet visor`, `cheek pad`, `helmet peak`, etc.) — not bare `helmet`, which still maps complete lids. After applying `052` / `057`, **restart the API** and run **`make backfill-canonical-categories`**.

**Component parts vs complete leaves (ZAC-271 / ZAC-272):** Each Components family has a `{Parent} parts` catch-all (renamed from bare `Parts`, hidden from nav like Helmet parts). Small hardware that used to substring-match the complete-product leaf (`fork` → Forks for “Fork Seals”, `headset` → Headsets for “Headset Spacers”, bare `brake` → Brakesets for “Brake Cable Parts”) maps to the parts shelf via high-priority keywords. Production still has a `brake`/`brakeset` → **Brakesets** mapping, so cables, olives, and adapters need those specific keywords **and** `taxonomy.RefineBrakes` (title: olive / cable / adapter / crimp vs complete brakeset). Classifier rubrics on Forks, Shocks, Brakesets, Handlebars, and the other product leaves send seal kits / olives / bar ends / hangers / spokes to the parts leaf. After applying `057` / `058`, **restart the API** and run **`make backfill-canonical-categories`**.

Under **Gear → Clothing**, Jerseys, Jackets, Shirts, Shorts, Pants, and Socks are **direct leaves** (migration `037` removed the intermediate Tops/Bottoms layer so mega-menu browse matches shoppable shelves). High-priority leaf mappings classify store paths and product names into the specific apparel type.

**Bikes Online combined product_type:** Shopify sale rows use `product_type` `Clothing & Protective Gear` for both apparel and protective gear (pads, helmets, gloves). Substring mapping hits `clothing` first, so path-based canonical lands on **Gear > Clothing** even for knee sleeves. Do **not** add a blanket `protective gear` mapping — it would misfile jerseys in the same bucket. After LLM classification (Protection / Helmets / Gloves at ≥ classifier threshold), run `make backfill-bikesonline-clothing-protective` to copy the live LLM path onto `canonical_category`, then rely on PDP preserve + recategorize skip (confident `metadata.llm_category`) so the column is not remapped back to Clothing.

Under **Components → Drivetrain**, **Bottom Brackets** is a dedicated leaf (migration `032`) with high-priority mappings for bottom-bracket keywords and LLM extraction of `bb_standard` / `bb_shell_width` for facet filters. Under **Components → Cockpit**, **Headsets** is a dedicated leaf with mappings for headset keywords and `headset_standard` extraction. Spacers, stem caps, and install tools stay in **Cockpit parts** or Accessories → Tools.

Under **Components → Wheels/Tires**, **Tubeless** is a dedicated leaf (migration `036`) for valves, rim tape, sealant, kits, and tire inserts. Mappings use **specific** keywords (`tubeless valve`, `rim tape`, `tire sealant`, etc.) — not bare `tubeless`, which would misclassify tubeless-ready tires. The legacy `tube`/`tubes` mapping is substring-based, so paths like `Tubeless Kits` previously landed in **Tubes** until the high-priority Tubeless rule runs first.

Under **Accessories**, **Pumps** is a dedicated leaf (migration `038`) for floor, mini/hand, frame, shock/fork, electric pumps, and CO2 inflators. Mappings use **specific** keywords (`floor pump`, `shock pump`, `mini pump`, etc.) — not bare `pump`, which would misclassify pump parts, pump-track bikes, and saddles. Pump parts and rebuild kits stay in **Components** or **Tools**.

Under **Accessories → Lights**, mappings use **specific** keywords (`lights`, `bike light`, `headlight`, `taillight`, `lamp`, etc.) — not bare `light` (migration `045`). A Bikes Online collection H1 containing **Lightweight** previously substring-matched `light` at priority 9 and dumped complete bikes (and a scooter/charger) into Lights (ZAC-234). Shopify breadcrumb fallback also rejects sentence-length marketing copy so that H1 cannot become `category_path`. After applying `045`, **restart the API** so in-memory mappings reload; then remapping / LLM classify for Bikes Online (recategorize skips confident `metadata.llm_category` and `manual_category_override`).

**Complete bikes vs Components → Suspension:** Shopify `product_type` values like **Full Suspension** (Cambria, Colorado Cyclist) and **Front Suspension** (Mack Cycle hardtails) substring-match bare `suspension` at priority 37 and beat the legacy `full suspension` keyword on the Mountain Bikes catch-all (priority 4). Migration `046` adds higher-priority `full suspension` / `front suspension` → **Bikes › Mountain Bikes** and `full suspension frames` → **Bikes › Frames**, tied with Forks at 38 so “Front Suspension Forks” still lands on Forks. Same class of bug as bare `light` / `pump` / `tubeless` / `bmx`. After applying `046`, **restart the API** and run **`make backfill-canonical-categories`** (skips `manual_category_override` and confident `llm_category`).

**Most specific breadcrumb (ZAC-245):** Store paths go general → specific. Joining the whole path let high-priority keywords in ancestors (`bike` in `Bike Parts`, or `gear` in `Cycling Gear`) win before `wheels` / `wheelset` on the leaf. `taxonomy.Map` now matches the rightmost segment first and falls back toward the root. Migration `048` adds high-priority `wheelset` / `bike wheels` / `complete wheels` → **Components › Wheels/Tires › Complete wheels** so a leaf like `Gravel Bike Wheels and Wheelsets` is not classified as Bikes (generic `bike`) or Gear. After applying `048`, **restart the API** and run **`make backfill-canonical-categories`**.

**Brakesets vs Brake parts (ZAC-272):** Production `category_mappings` include a priority-20 row that maps bare `brake` / `brakes` / `brakeset` → **Brakesets**. Store paths like `Brake Cable Parts`, `MTB/Road Brake Cables`, and `Brake Adaptors` therefore land on the complete-product leaf — “brake cable parts” does not contain the 057 keyword `brake parts`. `taxonomy.Map` only sees `category_path` (not titles), so olives named `BH59 Olive & Barb` stay on Brakesets even when `metadata.llm_category` already says Brake parts. `taxonomy.RefineBrakes` (via `RefineListing`) prefers **Brake parts** when the title is a cable, olive, adapter, crimp, bolt, noodle, or hose sold alone. Complete disc brakes / levers / calipers stay on Brakesets. Do **not** drop the bare `brake` → Brakesets mapping (that would dump complete disc brakes onto the parent). Migration `058` expands keywords and backfills Brakesets / parent rows by product name, store path, and confident `llm_category`. Skip `manual_category_override`. After applying `058`, **restart the API** and run **`make backfill-canonical-categories`**.

**Wheelsets / rims vs Tires (ZAC-263):** Sibling leaves under `Components › Wheels/Tires` confused the LLM classifier: Competitive Cyclist **Wheelset/…Tire Set** SKUs and store paths containing `Tires` set canonical to **Tires** even when LLM reasoning named a rim or wheelset. `taxonomy.Map` only sees `category_path` (not titles) and seed mappings do not emit the Tires leaf, so path remap cannot unstick those rows. `taxonomy.RefineWheelsTires` (used from scrape ingest, PDP map, recategorize, and LLM classify) prefers **Complete wheels** when the title contains wheelset / complete wheel / wheel, and **Rims** when it contains rim — **Wheelset wins over Tire Set**. Do **not** feed full product titles into `taxonomy.Map` (generic `bike` / `light` traps). Bare `wheel` skips hubs, spokes, freewheels, and wheel bags. Migration `056` updates classifier rubrics and backfills Tires / parent rows by product name (and copies confident `llm_category` Complete wheels / Rims onto canonical). Skip `manual_category_override`. After applying `056`, **restart the API**; the migration writes listings, then run **`make backfill-canonical-categories`** so ingest-time refine also applies.

**Apparel vs Bikes (ZAC-264):** Competitive Cyclist Impact categories look like `Women's Clothing > Women's Mountain Bike Clothing > Women's Mountain Bike Bottoms > Women's Skirts`. Unmapped leaves (`Women's Skirts`, `Men's Liners`, `Cycling Hats & Caps`, `Men's Tri Bike`) fall back to the parent, and `mountain bike` / `road bike` / `bike` substring-match those department names onto **Bikes › Mountain Bikes** (or Road / the Bikes parent). CC is not PDP-enriched, so the LLM classifier never corrects them. Migration `054` adds high-priority phrases (`mountain bike clothing`, `mountain bike bottoms`, `skirt`, `men's liners`, `road bike tops`, …) that beat generic bike keywords. New store leaves keep appearing, so path keywords alone do not stick. `taxonomy.RefineApparel` (via `RefineListing`) then moves a Bikes-tree listing to Gear › Clothing when the **title** is a garment (short, liner short, skirt, t-shirt, jersey, polo, tight, knickers, cap, skinsuit, tri suit, …). Complete bikes (`Liv Women's Tempt 4 Hardtail Mountain Bike`, short-travel MTBs, framesets) stay on Bikes. Do **not** use bare `liners` (helmet liners stay on Helmet parts) and do **not** feed full product titles into `taxonomy.Map` (generic `bike` traps). After applying `054`, **restart the API** so in-memory mappings reload. Title refine runs on scrape ingest, PDP map, recategorize, and LLM classify — no extra listing backfill is required for new SKUs.

Under **Bikes**, **BMX Bikes** is a dedicated leaf (migration `039`) for complete BMX bicycles. Mappings use **specific** keywords (`bmx bike`, `complete bmx`, `freestyle bmx`, `bmx / dirt jump`, etc.) — not bare `bmx`, which would misclassify BMX stems, helmets, and tires. Dirt-jump MTB hardtails stay under **Mountain > Dirt Jump**; youth balance/MTB bikes stay under **Kids**; BMX frames sold alone stay under **Frames**. BMX parts and gear remain in **Components** / **Gear** and can be tagged with `intended_use = BMX` after migration `039` extends the shared enum.

## Data Flow

1. **Enrichment**: Scraper returns `category_path` (breadcrumb array) from PDP.
2. **Path-based taxonomy**: `taxonomy.Map` derives a candidate `canonical_category` and `category_id` from mappings by matching the **most specific** `category_path` segment first — **unless** `metadata.llm_category` already records a confident prior classification (`confidence` ≥ threshold from `LLM_CATEGORY_PRESERVE_THRESHOLD` or the classifier row, default `0.5`), in which case only `category_path` is refreshed and LLM-owned `canonical_category` / `category_id` are preserved until the classifier runs again successfully. Scrape ingest, PDP map, and recategorize then run **`taxonomy.RefineListing`** (`RefineWheelsTires` then `RefineBrakes` then `RefineApparel`) on that candidate (or, when LLM is preserved, on the existing path) so wheelset/rim titles cannot stay on Tires (ZAC-263), brake cables/olives/adapters cannot stay on Brakesets (ZAC-272), and apparel titles cannot stay on Bikes (ZAC-264). Admin **Recategorize** / `make backfill-canonical-categories` skips `manual_category_override`; confident `llm_category` still skips **path** remap but title refine still runs.
3. **LLM classifier** (if enabled): Overwrites `canonical_category` / `category_id` when output confidence ≥ threshold; otherwise stores audit metadata only.
4. **Listing**: `store_listings.category_id` links to the canonical category row.

## Key Files

| Path | Purpose |
|------|---------|
| `packages/shared/category_taxonomy.json` | Seed data for mappings |
| `apps/api/internal/db/categories.go` | Category tree CRUD |
| `apps/api/internal/taxonomy/` | Mapping resolution, cache |

## Admin UI

- **CategoryManager**: Tree CRUD for `categories`, including **Hide from main nav**
- **TaxonomyManager**: View/edit mappings
- **CategoryClassifierManager**: LLM classifier config
- **PromptProfileManager**: LLM extraction profiles per category

## Backfills

```bash
make backfill-canonical-categories   # Recategorize after taxonomy changes (after 052 / 057 / 058 parts shelves: restart API first)
make backfill-bikesonline-clothing-protective   # Bikes Online Clothing & Protective Gear → LLM Protection/Helmets/Gloves (DRY_RUN=1 preview)
make backfill-field-library          # After migration 019: LLM field defs + profile composition rows
```
