# Category IA

## Problem Statement

How might we help deal-hunters find the right MTB product family in one or two taps via the mega-menu—without a full retailer-depth catalog tree?

## Recommended Direction

**v1 (shipped):** Add `Gear → Eyewear → Sunglasses | Goggles` with high-priority taxonomy mappings and product-name backfill (migration `027`). LLM classifier picks up new paths from the live `categories` tree automatically.

**v2 (shipped):** Add `Components → Drivetrain → Bottom Brackets` and `Components → Cockpit → Headsets` with mappings, product-name backfill, and LLM spec profiles for `bb_standard` / `headset_standard` filters (migration `032`). See [bb-headset-shelves.md](./bb-headset-shelves.md).

**v3 (shipped):** Add `Components → Wheels/Tires → Tubeless` with high-priority mappings for valve/tape/sealant/kit/insert keywords and product-name backfill (migration `036`). Tubeless-ready tires stay in **Tires**; install tools stay in **Accessories → Tools**.

**v4 (shipped):** Flatten **Gear → Clothing** — Jerseys, Jackets, Shirts, Shorts, Pants, and Socks are direct children (migration `037`); high-priority leaf mappings; 308 redirects from old Tops/Bottoms URLs.

**Strategy:** Targeted shelf additions where inventory exists; fix classification quality before deepening the tree. Do not flatten Components/Bikes discipline trees.

## Key Assumptions to Validate

- [ ] Mega-menu remains primary browse path (PostHog `category_nav` events)
- [ ] Sunglasses vs Goggles split matches how users shop MTB eyewear
- [ ] Path + product-name heuristics capture most eyewear without full LLM re-run

## MVP Scope (done)

- Migration `027_gear_eyewear.sql`
- `category_taxonomy.json` eyewear mappings
- Category SEO copy for eyewear slugs
- `make backfill-canonical-categories` after migrate

## Not Doing (and Why)

- **Clothing parent reclassify** — large bucket on `gear-clothing` parent; improved by migration `037` leaf mappings + `backfill-canonical-categories` but may still need classifier batch work
- **Uncategorized backlog** — 720 null `category_id`; orthogonal cleanup pass
- **Pedals → Cockpit** — Wrong mental model; optional later promote to Components sibling
- **Rename Gear → Apparel** — High slug/URL churn for marginal label gain
- **Split Tools** — Mixed inventory; thin leaves

## Open Questions

- When to run Clothing leaf reclassify (mappings vs classifier batch vs hybrid)?
- Pull Pumps out of Tools as Accessories sibling if pump volume grows?

## Follow-up backlog

| Item | Approx. impact | Approach |
|------|----------------|----------|
| Empty `gear-clothing` parent bucket | Reduced by `037` leaf mappings + backfill | Run `backfill-canonical-categories`; classifier for remainder |
| Uncategorized listings | ~720 visible | Same + admin Data Browser spot checks |
| Pedals as Components sibling | ~129 visible | Migration move slug; remap `components-drivetrain-pedals` → `components-pedals` |
| Thru-axle leaf | ~14 visible | Wheels/Tires > Parts until volume grows; see [bb-headset-shelves.md](./bb-headset-shelves.md) |
| Cable/housing leaf | ~61 visible | Separate pass; Brakes vs Drivetrain Parts disambiguation |
