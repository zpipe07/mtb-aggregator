# Category IA

## Problem Statement

How might we help deal-hunters find the right MTB product family in one or two taps via the mega-menu—without a full retailer-depth catalog tree?

## Recommended Direction

**v1 (shipped):** Add `Gear → Eyewear → Sunglasses | Goggles` with high-priority taxonomy mappings and product-name backfill (migration `027`). LLM classifier picks up new paths from the live `categories` tree automatically.

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

- **Clothing parent reclassify** — 5,879 visible on `gear-clothing` parent; separate multi-thousand-listing project
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
| Empty `gear-clothing` parent bucket | ~1,524 visible in-stock on parent | Improve mappings + classifier; `backfill-canonical-categories` |
| Uncategorized listings | ~720 visible | Same + admin Data Browser spot checks |
| Pedals as Components sibling | ~129 visible | Migration move slug; remap `components-drivetrain-pedals` → `components-pedals` |
