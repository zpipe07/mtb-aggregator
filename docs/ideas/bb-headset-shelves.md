# Bottom Brackets & Headsets Category Shelves

## Problem Statement

How might we help mega-menu browsers and wrenching shoppers find bottom bracket and headset deals—and filter by interface standard—without inventing a sixth Components mid-level or a retailer-depth BOM tree?

## Recommended Direction

**Minimal shelves + standards as facets.** Add two leaves only:

- `Components → Drivetrain → Bottom Brackets` (`components-drivetrain-bottom-brackets`)
- `Components → Cockpit → Headsets` (`components-cockpit-headsets`)

Do **not** add a Frame Hardware / Bearings mid-level. Inventory already clusters where these leaves would live (BB → Drivetrain Parts/parent; headsets → Cockpit parent), and prior IA rule is targeted shelves under existing discipline trees ([category-ia.md](./category-ia.md)).

For wrenching shoppers, category = product family; **compatibility lives in filters**:

- BB leaf: `bb_standard` (and `bb_shell_width`) via LLM prompt profile on the new category
- Headset leaf: `headset_standard` on the new category

Ship like eyewear (migration `027`): category rows + high-priority `category_mappings` + product-name backfill; update parent `categories.description` rubrics; SEO copy for new slugs; `make backfill-canonical-categories` after migrate.

### Live inventory (visible, in-stock) — why this scope

| Family | Approx. product volume | Current home | Verdict |
|--------|------------------------|--------------|---------|
| Bottom brackets | ~84 products (+ ~27 tools) | Drivetrain Parts / parent | **Add leaf now** |
| Headsets | ~6 true (+ ~7 spacers/caps, ~4 tools) | Cockpit parent | **Add leaf now** (thin but misfiled; enables browse + standards filters) |
| Cable/housing | ~61 | Parts buckets | Follow-up candidate |
| Thru-axles | ~14 | Wheels Parts (scattered) | Keep in Parts until volume grows |
| Cleats | ~15 | Already mapped → Drivetrain Parts | Leave |

## Key Assumptions to Validate

- [ ] Product-name keywords + high-priority mappings capture most true products without a full LLM re-run (tools stay in Accessories/Tools)
- [ ] Headset spacers / stemcaps / top caps stay in **Cockpit → Parts**, not the Headsets leaf
- [ ] BB/headset standards extract reliably from titles/descriptions into `llm_specs`
- [ ] Thin headset inventory still justifies a mega-menu leaf (revisit if it stays near-empty)

## MVP Scope (shipped)

- Migration `032_bb_headset_shelves.sql`
- `category_taxonomy.json` BB/headset mappings
- Category SEO copy for new slugs
- LLM prompt profiles with filterable `bb_standard` / `headset_standard`
- `make backfill-canonical-categories` after migrate

## Not Doing (and Why)

- **Frame Hardware mid-level** — Drivetrain/Cockpit placement is the right browse mental model
- **Thru-axle leaf** — ~14 listings; deepen when volume justifies
- **Cable/housing leaf** — separate pass with Brakes/Drivetrain Parts disambiguation
- **Cleats leaf** — thin; Drivetrain Parts mapping is enough
- **Headset spacers as Headsets** — adjacent cockpit hardware; keep in Parts
- **BB tools / headset presses as Components** — stay under Accessories → Tools
- **Standards as category grandchildren** — use spec facets instead

## Open Questions

- Re-enrich BB/headset listings to populate `bb_standard` / `headset_standard` facets (run targeted enrich after migrate)
- Pull cable/housing into its own leaf when Brakes vs Drivetrain disambiguation is clearer
