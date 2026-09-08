# Deals Page UX (ZAC-220)

## Problem Statement

How might we make the base `/deals` page guide users toward meaningful category browsing and high-value deals, instead of presenting a discount-sorted firehose with no obvious discovery path?

## Recommended Direction

Ship **Track 1 quick wins** now (category chips, default `value` sort, price filter, clearer mega menu). Evaluate **Direction B** (curated above-fold + persistent category bar) via Canvas prototypes before a larger layout change.

Track 1 is implemented in the web app. Direction B prototypes: [`deals-page-current.canvas.tsx`](../../.cursor/projects/Users-zackpiper-workspace-mtb-aggregator/canvases/deals-page-current.canvas.tsx) and [`deals-page-direction-b.canvas.tsx`](../../.cursor/projects/Users-zackpiper-workspace-mtb-aggregator/canvases/deals-page-direction-b.canvas.tsx).

## Key Assumptions to Validate

- [ ] Users on base `/deals` will click category chips or the **Categories** nav control — measure `filter_applied` with `nav_source: browse_chips` / `mega_menu`
- [ ] Default **`value`** sort surfaces more credible deals than **`discount`** — compare outbound clicks and time-on-page vs prior baseline
- [ ] Price range filter reduces bounce from low-dollar discount noise — track `filter_applied` for `min_price` / `max_price`

## MVP Scope (Track 1 — shipped)

- Browse-by-category chips on base `/deals`
- Default sort `value`; **Best value** in sort dropdown
- Min/max price in sidebar/drawer
- Split nav: **All deals** + **Categories** mega menu trigger

## Not Doing (and Why)

- **Category-first architecture** — high risk; revisit if Direction B prototypes validate
- **Personalized landing** — needs client tracking infrastructure
- **Spec filters without category** — specs are category-scoped by design
- **New blended “featured” sort** — `value` is sufficient for now

## Open Questions

- Should category chips order by `sort_order` (current) or deal count?
- Does Direction B duplicate the home page too much?
- After quick wins ship, does category engagement improve enough to skip Direction B?
