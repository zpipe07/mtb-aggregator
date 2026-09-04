# MTBbot community feedback → The Dropper (ZAC-93)

## Problem Statement

How might we use years of public rider feedback on **MTBbot** (the site The Dropper was built to replace) so we double down on what made that product loved, and skip the features that would recreate why it died?

## Recommended Direction

Treat MTBbot’s Reddit record as a **validated product brief**, not nostalgia.

Riders did not ask for a prettier aggregator. They asked for a **fast, MTB-specific sale browser** that (1) puts prices from many shops on one screen, (2) is bookmarkable by category/brand/discount, and (3) **stays up**. Demand outlived the product: the 2019 launch thread is still cited years later, returning riders were pointed at `mtbbot.com` in late 2024, and when the site went dark the community immediately looked for a replacement (including [The Dropper’s own launch post](https://www.reddit.com/r/MTB/comments/1rnh9g1/because_mtbbotcom_is_dead_i_built_this/)).

The Dropper already ships the core loop MTBbot proved: multi-store sale ingest, category/spec filters, search, bookmarkable URLs, price history, and a much larger US store list. The highest-leverage remaining work is **trust at the card** (real sizes, real discounts, shipping honesty) and **repeat-visit hooks** (saved searches / price-drop alerts) — not a shipping calculator, not a bike-builder, not EU/UK/AU coverage in the first wave.

## Sources

| Thread | Date | Role | Access |
| --- | --- | --- | --- |
| [Created a tool for finding MTB stuff on sale](https://www.reddit.com/r/MTB/comments/d8tndc/created_a_tool_for_finding_mtb_stuff_on_sale/) (`d8tndc`) | 2019-09-24 | Launch + 117 comments, **509 upvotes**. Primary feature request dump. | [Wayback 2023-06-12 (old.reddit)](https://web.archive.org/web/20230612100142/https://old.reddit.com/r/MTB/comments/d8tndc/created_a_tool_for_finding_mtb_stuff_on_sale/); [Wayback 2025-03-25](https://web.archive.org/web/20250325191527/https://www.reddit.com/r/MTB/comments/d8tndc/created_a_tool_for_finding_mtb_stuff_on_sale/) |
| [Website a redditor made for cycling deals](https://www.reddit.com/r/MTB/comments/drlqi8/website_a_redditor_made_for_cycling_deals/) (`drlqi8`) | 2019-11-04 | People **searched by description** when they forgot the name. Trust question on Jenson “faux deals.” | [Wayback 2023-06-12](https://web.archive.org/web/20230612081521/https://old.reddit.com/r/MTB/comments/drlqi8/website_a_redditor_made_for_cycling_deals/) |
| [Returning to MTB after 20 years](https://www.reddit.com/r/MTB/comments/1hts17v/returning_to_mtb_after_20_years/) (`1hts17v`) | ~2024-12 | Unprompted recommendation: “Take a look at mtbbot.com for deals.” | [Wayback 2025-03-08](https://web.archive.org/web/20250308075408/https://www.reddit.com/r/MTB/comments/1hts17v/returning_to_mtb_after_20_years/) |
| [mtbbot dead](https://www.reddit.com/r/MTB/comments/1pbq5tz/mtbbot_dead/) (`1pbq5tz`) | ~2024–25 | Demand after the site died. | Live Reddit blocked from this environment (no Wayback snapshot) |
| [Because mtbbot.com is dead, I built this](https://www.reddit.com/r/MTB/comments/1rnh9g1/because_mtbbotcom_is_dead_i_built_this/) (`1rnh9g1`) | 2026 | Earlier Dropper launch. One UI quote already shipped as [ZAC-179](https://linear.app/zacks-personal-projects/issue/ZAC-179/update-hero-section-based-on-feedback). | Live Reddit blocked; no Wayback snapshot |
| [I created a mtbbot replacement](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/) (`1v2t40h`) | 2026 | Later r/MTB share. **Low traction** — do not treat a second launch post as a growth lever. See [MARKETING.md](../MARKETING.md). | Live Reddit blocked; operator report |
| Google `mtbbot site:www.reddit.com` | — | Extra mentions. | Search blocked from this environment |

**Scope note:** Two of the five linked threads could not be re-fetched here (Reddit IP block; no archive). The 2019 launch thread plus the “forgot the name,” “returning rider,” and already-captured Dropper hero feedback are enough to rank themes. Re-read `1pbq5tz` and `1rnh9g1` from a normal browser if you want every late comment.

## What riders loved (do not lose)

These are the reasons people bookmarked MTBbot for years. The Dropper should protect them.

1. **Speed and simplicity.** OP’s stated goal: “It just takes too many clicks on Jenson or Backcountry to find out if 27.5 Minions or Magic Marys are on sale.” Praise clustered on “fluid on a phone,” “loads so fast,” “no fluff.” A 2026 Dropper comment said the same: useful, no fluff — then bounced off a hero that looked like a 404 ([ZAC-179](https://linear.app/zacks-personal-projects/issue/ZAC-179/update-hero-section-based-on-feedback), done).
2. **One screen of sale prices.** The differentiator vs Google Shopping (OP’s own reply): browse a category, see prices without opening ten tabs, compare SLX vs XT in the same list. Bookmarkable example they shipped: `mtbbot.com/components/derailleurs?discount=20&brands=shimano&sort=price%7Casc`.
3. **MTB-only intent.** Returning riders were sent to MTBbot as *the* deals URL, then Pinkbike/Marketplace for used. A generic shopping SERP dumps CRC/Merlin links that geo-block North America.
4. **Stay alive.** “3 years later and I still check MTBBot.” “5 years later but some Australian/NZ store could be good.” The product died from **feed/scrape maintenance**, not from lack of money or interest (same conclusion as the original Gemini architecture chat). Reliability *is* the feature.

## Themes, ranked for The Dropper

Priority is **user value × how often it was asked × whether we already have it**. Quotes are paraphrased from `d8tndc` unless noted.

### P0 — already the product; keep investing

| Theme | What they said | The Dropper today |
| --- | --- | --- |
| Multi-store sale index | Launch stores: Jenson, Backcountry, Evo, Competitive Cyclist; CRC promised. Loudest add: **Worldwide Cyclery**. | WWC, Jenson, Evo, CC, plus DTC/specialty (Canyon, Specialized, Trek, Fox, Giro, …). **No Backcountry / CRC / Wiggle.** |
| Fast browse + filters | Categories, brand, % off, later Boost/non-Boost, gender on apparel. | Category tree, brand facets, spec facets, `min_price`/`max_price`, sort including `value` / `discount`. |
| Search | “Could you include a search function so I could look for a specific item?” / “filter by keyword (27.5x1.9).” | Search exists; empty/typo state is still weak ([ZAC-235](https://linear.app/zacks-personal-projects/issue/ZAC-235/improve-empty-search-state-typos-out-of-scope-queries-collapsed)). |
| Bookmarkable URLs | OP treated shareable filtered URLs as the answer to “why not Google?” | Filter state in the URL on `/deals` and category/hub routes. |
| Price history | “graph of historical pricing … or at least lowest historical price.” | Chart on deal detail + recent-drop rails. Card-level “price just dropped” still open ([ZAC-101](https://linear.app/zacks-personal-projects/issue/ZAC-101/on-deal-cards-show-if-price-has-recently-dropped)). |

### P1 — apply next (high signal, still incomplete)

**1. Sizes and variants on the card (most painful click-through).**

> “Sucks to get to the page only to find out XXL is the only size, or that size small is discounted, but size large is normal price.”
> Marin Hawk Hill “said size XS available. When I browsed the website all sizes were available.”

This is the same class of trust bug as hidden Jenson in-stock rows. Grouped variants exist (`group_variants=true`). [ZAC-241](https://linear.app/zacks-personal-projects/issue/ZAC-241/show-in-stock-sizes-and-variant-prices-on-deal-cards) adds **in-stock size/color chips** plus a Bikes **`bike_size`** LLM field (scalar per listing row; letters / cm / TT inches; visible on cards when there are no variant sizes, and filterable as Size on `/deals/c/bikes`). Remaining store-to-store `variant_options` consistency is still [ZAC-161](https://linear.app/zacks-personal-projects/issue/ZAC-161/normalize-scraping-enrichment-variants-across-store).

**2. Trust the discount (Jenson “faux deals”).**

From `drlqi8`: Jenson “increasing their prices by 20% and then knocking them back down.” From launch: “% off isn’t necessarily that useful as sometimes the regular prices may differ”; another rider said % off **is** useful because bike MSRP is published. Both can be true: **show % off and original, but prefer savings dollars / price history / “at historical low.”** That is exactly why `sort=value` and price history exist. Next: call out **inflated list price** when history never hit the claimed MSRP ([ZAC-101](https://linear.app/zacks-personal-projects/issue/ZAC-101/on-deal-cards-show-if-price-has-recently-dropped), [ZAC-215](https://linear.app/zacks-personal-projects/issue/ZAC-215/should-we-combine-duplicate-products-across-stores)).

**3. Repeat-visit: wishlist / saved search / email on drop.**

> “maybe like a cart or wishlist … or maybe even get an email if a price drop happens.” (OP: watching a Bronson to 30% off.)

No Linear ticket today. Roadmap already named this as a later phase. This is the feature that turns a one-session aggregator into a habit — the behavior “I still check MTBBot every once in a while” without requiring the user to remember to check.

**4. Shipping honesty without a calculator.**

Top-voted comment (53): add shipping + currency. OP agreed a **full calculator is too hard** (weights, dims) and proposed a **free-shipping indicator** (e.g. Jenson $50+, not on complete bikes). Others: tag **ship-from country** so duties/geoblocks are the user’s problem, not ours. Do **not** build rate shopping. Do **store-level shipping badges** (free over $X, free in CONUS, “bikes excluded”).

**5. Coverage: US depth before geography.**

Retailer requests were the longest thread. Map:

| Requested | Dropper | Notes |
| --- | --- | --- |
| Worldwide Cyclery | Yes | Highest-signal US add in 2019 |
| Jenson, Evo, Competitive Cyclist | Yes | Original MTBbot set |
| Fox Racing | Yes | Explicitly requested |
| Backcountry / Steepandcheap | No | Same parent as CC; Steepandcheap often cheaper, no free ship |
| CRC / Wiggle / Merlin / Tweeks / Tredz / Evans | No | UK; SRAM/Shimano geoblock |
| bike24, hibike, bike-components, bike-discount | No | EU; VAT + geoblock |
| Airborne outlet, Bikes Direct flash, Blue Sky, Hincapie | No | Boutique / flash; Bikes Direct often Facebook-only |
| Amazon | No | OP declined: too much junk to weed |
| AU: mtbdirect, pushys, bicyclesonline, bikeinn | No | Still requested 5 years later |
| Manufacturer clearances | Partial | Canyon, Specialized, Trek, Revel, Canfield, … many Linear “add store” tickets remain |

**Do not pause the US catalog to chase CRC.** International was the #2 chorus after “more shops,” but OP already hit the wall: SRAM/Shimano **cannot be sold across regions**. A country toggle that lies is worse than a US-only site. Finish US/CA shops that ship CONUS (Backcountry/Steepandcheap, leftover Linear store tickets) before EU/UK/AU.

**6. Performance is a product promise.**

MTBbot’s love was speed. Open Dropper tickets that violate that promise: [ZAC-79](https://linear.app/zacks-personal-projects/issue/ZAC-79/improve-page-speed-on-deals-page), [ZAC-229](https://linear.app/zacks-personal-projects/issue/ZAC-229/im-still-getting-a-long-running-loading-spinner-on-deals-page). A spinner that “never ends” is the opposite of “too many clicks on Jenson.”

### P2 — useful, later

- **Cashback / coupon stacking** (Rakuten, ActiveJunky) — related [ZAC-166](https://linear.app/zacks-personal-projects/issue/ZAC-166/add-coupon-codes-page).
- **First-time buyer codes** (OP: 20% CC vs Backcountry on the same OneUp dropper).
- **Dedup across stores** — [ZAC-215](https://linear.app/zacks-personal-projects/issue/ZAC-215/should-we-combine-duplicate-products-across-stores).
- **Industry “best time to buy”** (OP: Black Friday → early spring) — [ZAC-17](https://linear.app/zacks-personal-projects/issue/ZAC-17/display-industry-data).
- **Distribution:** r/mtbdeals sticky, Instagram stories, people searching “that redditor deals site.” [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228/create-social-media-presence). The name **must** be memorable; `drlqi8` is a warning that “mtbbot” was already forgettable.
- **Affiliate is expected** if the tool is good: “when I see affiliate links I get annoyed — but in this case you 100% earned your cut.”
- **LBS tension:** one comment, low score: “even easier to give Amazon or Jenson your money than your local bike shop.” Not a blocker; optional “support your LBS” copy is enough.

### Not doing (and why)

| Idea | Why skip |
| --- | --- |
| Full shipping / duty / VAT calculator | OP tried; needs weights and dims most PDPs omit. Free-ship badge is the 80% solution. |
| Country/currency switch that mixes EU+US inventory | SRAM/Shimano geoblock; CRC links dump NA users on the homepage. Separate regional indexes or don’t. |
| PCPartPicker-for-bikes (compatibility + full build) | Cool, different product. Kills the “fast sale list” job. |
| Native app | Explicit ask, low urgency. PWA/bookmarks already match how people used MTBbot. |
| Broaden to road | One comment. We already hide road from homepage ([ZAC-97](https://linear.app/zacks-personal-projects/issue/ZAC-97/dont-show-road-bikes-in-top-deals-section-on-home-page)). |
| Amazon as a feed | OP: volume vs signal. Same trap as CRC’s catalog size. |
| Open-sourcing scrapers so strangers add shops | Fun in 2019; ToS/block-risk was already flagged. Store adapters stay first-party. |
| Recreating MTBbot’s hamburger/footer-ajax bugs | Historical. Keep filter changes obvious and show loading ([ZAC-229](https://linear.app/zacks-personal-projects/issue/ZAC-229/im-still-getting-a-long-running-loading-spinner-on-deals-page) is the live version). |

## Key Assumptions to Validate

- [ ] **Card-level sizes cut wasted outbound clicks** — measure `view_at_store` vs bounce-back; compare grouped cards that show size chips vs those that don’t. ([ZAC-187](https://linear.app/zacks-personal-projects/issue/ZAC-187/are-we-correctly-capturing-the-view-at-store-event) must work first.)
- [ ] **“Historical low” / savings-dollars beats raw % off for trust** — A/B or PostHog: outbound rate on `sort=value` vs `sort=discount` (already in [deals-page UX](deals-page-ux-zac-220.md)).
- [ ] **Saved search + email is worth auth** — waitlist or “email me this search” on a few hubs before building accounts.
- [ ] **US-only is acceptable if coverage is deep** — UK/EU/AU asked loudly, but a lying country toggle would burn trust faster than a clear “ships to US” scope.

## MVP Scope (what to actually build from this ticket)

This ticket is research. The implementation queue, in order:

1. **Variant/size truth on cards and PDP** (P1.1) — blocked on consistent variant ingest ([ZAC-161](https://linear.app/zacks-personal-projects/issue/ZAC-161/normalize-scraping-enrichment-variants-across-store)).
2. **Discount honesty** (P1.2) — “price dropped” / historical-low on cards ([ZAC-101](https://linear.app/zacks-personal-projects/issue/ZAC-101/on-deal-cards-show-if-price-has-recently-dropped)); later, flag list prices the history never supported.
3. **Saved search or price-drop email** (P1.3) — new ticket; smallest version is “email this URL when any result drops.”
4. **Per-store shipping badge** (P1.4) — new ticket; static policy text, not live rates.
5. **Keep the deals page fast** (P1.6) — [ZAC-79](https://linear.app/zacks-personal-projects/issue/ZAC-79/improve-page-speed-on-deals-page) / [ZAC-229](https://linear.app/zacks-personal-projects/issue/ZAC-229/im-still-getting-a-long-running-loading-spinner-on-deals-page).
6. **US catalog gaps** — Backcountry/Steepandcheap if feeds exist; otherwise the existing “add store” backlog. Do not start CRC.

## Open Questions

- Re-read live comments on `1pbq5tz` and `1rnh9g1` from a residential IP — capture anything this pass missed (especially Dropper-specific UX).
- Is Backcountry still worth a parser given CC overlap, or is Steepandcheap the only incremental inventory?
- For shipping badges, is a store-level field in `stores` enough, or do we need category exceptions (bikes vs parts) from day one?

## Source excerpts (high-signal)

Launch OP (`d8tndc`): product feeds, fast UI, Jenson/Backcountry/Evo/CC, CRC next, asked for feature ideas.

Top request: shipping + currency + CRC + Merlin; skepticism of % off when MSRPs differ.

OP on shipping: calculator needs weight/dims; **free-shipping indicator** is the realistic win.

OP vs Google: browse derailleurs, see prices immediately, bookmark `discount=20&brands=shimano`; Google sent him to CRC pages that don’t ship to Canada.

Durability: “3 years later and I still check”; “5 years later but some Australian/Nz store could be good.”

`drlqi8`: forgot the URL, then “nevermind, found it mtbbot.com”; “Does it filter out the faux deals put out by Jenson?”

`1hts17v`: “There are incredible sales right now. … Take a look at https://mtbbot.com/ for deals.”

Dropper launch (`1rnh9g1`, via [ZAC-179](https://linear.app/zacks-personal-projects/issue/ZAC-179/update-hero-section-based-on-feedback)): Android, useful, no fluff; hero “Stop searching” felt like a dead link until they scrolled.
