# The Dropper — marketing plan

**Status:** Written plan (ZAC-258). Campaigns are not launched yet.  
**Site:** [thedropper.shop](https://thedropper.shop)  
**Owner:** Zack  
**Created:** 2026-09-04

This is the go-to-market plan. Technical SEO, GEO, and product distribution details stay in the linked docs; this file decides **what we do for growth, in what order, and how we know it worked**.

## Situation

The Dropper is a live US-focused MTB deals aggregator: multi-store sale pages, category/brand/price hubs, filters, price history, and a curated [giveaways](https://thedropper.shop/giveaways) directory. Monetization is **affiliate-first**. The product already does the job MTBbot proved riders want — one fast sale feed — and launched on Reddit as that successor.

What is **not** true yet:

- Organic search is not a traffic engine. Google Search Console has shown ~0 deal-intent clicks; impressions skew toward brand-name confusion around “dropper” (the component), not “MTB deals.”
- There is **no social presence**, **no email list / Friday Drop backend**, and **no blog**.
- SEO and GEO plumbing is ahead of demand: category URLs, curated hubs, sitemap/robots, JSON-LD, `llms.txt`. More markup will not create visitors.

So this plan is **create demand and a repeatable way to send people to live inventory**, not another technical SEO sprint.

## Goal

**Primary success metric: traffic** — weekly unique visitors to `thedropper.shop` (Vercel Analytics + PostHog).

Traffic is the right north star while the site is still unknown. Affiliate revenue before sessions is vanity math.

**Suggested supporting metrics** (do not replace traffic):

| Metric | Why it matters | Source |
| --- | --- | --- |
| Organic clicks + impressions | Proves SEO is compounding, not just direct/Reddit spikes | Google Search Console |
| Returning visitors (7-day / 28-day) | Habit is the MTBbot moat (“I still check it”) | PostHog / Vercel |
| `deal_outbound_click` | Traffic quality — people who actually shop | PostHog |
| Referral sessions by source | Shows which channel earned the visit | PostHog / Vercel |
| Email subscribers + open rate | Owned channel once Friday Drop exists | ESP (later) |

**Guardrails:** bounce-and-leave on home, outbound click-through on deal cards, and “did they hit a money page” (`/deals`, `/deals/c/…`, `/deals/hub/…`). More sessions that never see a listing are not a win.

No calendar deadline. Sequence below is **order of leverage**, not a date-bound OKR.

## Positioning

**One line (already on the site):** “Every MTB sale. One feed.”

**Who we are talking to**

1. **Deal hunters** who already bounce Jenson / WWC / CC / Evo looking for Fox, SRAM, tires, or a complete bike on sale.
2. **Returning or first-bike riders** who need a starter kit and a trustworthy price, not a magazine review.
3. **Bookmark people** — the MTBbot user. They want a URL they can reopen on Friday night, not a feed they have to remember to follow.

**What we are not:** Pinkbike, Vital, or a “best eMTB 2026” publisher. We win when the page shows **live cross-retailer prices with a date**. Editorial copy exists to send people into that inventory.

**Name risk:** “The Dropper” is memorable on trail, easy to confuse in search with dropper seatposts. Brand queries will stay messy. Acquisition copy should lead with **MTB deals / sale feed**, not the component.

## Channel strategy

Priority for a solo operator: **SEO (compounding) + community (near-term sessions)**, then **one content asset**, then **social handle + Friday Drop** once there is something worth repeating.

### 1. SEO — primary compounding channel

**Job:** Get buyer-intent queries onto existing money pages.

The technical baseline is already built. Do not open a second SEO workstream. Execute and measure:

- Keep the **curated indexable set**: category hubs, high-value brand+category, and a few price-band hubs **gated by inventory** (floor ~5 listings; prefer ~10+). See [distribution / SEO](ideas/thedropper-distribution-seo.md) and [price-band hubs](ideas/price-band-hub-indexing.md).
- Prove indexation on the flagship money URLs before adding more hubs:
  - `/deals/c/bikes/mountain`
  - `/deals/c/bikes/emtb`
  - `/deals/hub/mountain-bikes-under-3000`
  - `/deals/hub/emtbs-under-5000`
- After deploys: GSC URL Inspection → Request indexing on those URLs only.
- One-time: Bing Webmaster Tools + sitemap (Copilot / Perplexity often retrieve via Bing). See [AI citation](ideas/ai-agent-citation.md).
- On-page: dated, answer-shaped intros (count, price range, 2–3 example deals) on eMTB first, then mountain bikes. That copy is for Google **and** agents.

**Do not:** explode filter combinations into URLs, publish thin “best of” guides to chase SERPs we cannot win, or add more Product/Offer schema sitewide.

**Traffic test:** GSC clicks to a money page > 0, then a rising 28-day click trend. Until then, SEO is hygiene + proof, not a content factory.

### 2. Community — fastest honest traffic (worthy extra)

**Job:** Send riders who already want a deals list to a bookmarkable URL.

MTBbot grew on Reddit and died from ops, not demand. The Dropper already has a launch thread. Community is **experimental and high-leverage**, not a spam engine.

**In**

- Treat **r/MTB** and **r/mtbdeals** as the only regular surfaces. Reply when someone asks “where do I find sales?” or “is mtbbot dead?” with the site and a specific category/hub URL — not a generic homepage dump.
- One useful follow-up post when there is a **real** story (new store coverage, a dense week of eMTB closeouts, giveaways strip actually has open entries). Same tone as the product: no fluff.
- Keep the name in the post body. People forgot “mtbbot” and searched by description.

**Out**

- Daily deal dumps, affiliate-looking titles, or brigading. One bad week can close the only channel that has ever worked for this category of site.
- Making Reddit the **plan**. If it spikes traffic, capture those people into email as soon as Friday Drop exists.

**Traffic test:** referral sessions from reddit.com and whether they reach `/deals` or a hub (PostHog path).

### 3. Content — few pages that point at live deals

**Job:** Give search and social something shareable that is not another empty “blog.”

There is no blog route today. Do not stand up a magazine. Ship **one or two indexable articles** that deep-link to current `/deals` filters and hubs.

**First piece (already ticketed):** [ZAC-250](https://linear.app/zacks-personal-projects/issue/ZAC-250) — “products you need to get started.” Frame it as a **returning-rider / first-bike checklist** (bike or a sane used-bike note, helmet, shoes, pedals, dropper, tires, pack/tool). Every item links to the live category or a filtered deals URL, not a static product pick that goes stale. Date the page (“prices as of …”) and re-scrape mentally when inventory shifts.

**Second piece (only after the first is live and linked):** a single recurring format — **“This week’s drops”** — 5–8 listings with savings dollars, store, and in-stock honesty. That template becomes Friday Drop + Instagram fodder. Do not invent a new format each week.

**Later / maybe:** seasonal “when to buy” (Black Friday → spring) once we have price-history stories worth telling. Industry-data ticket [ZAC-17](https://linear.app/zacks-personal-projects/issue/ZAC-17) is product, not a reason to write eight guides.

**Do not:** “Best mountain bikes under $3000” essays that compete with publishers. The hub **is** that page.

**Traffic test:** sessions landing on the article and click-through to `/deals/c/…` or outbound.

### 4. Social — light presence, not a second job

**Job:** Be findable and have a place to put the weekly drops. Ticket: [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228).

**Default: Instagram first** (visual product, deal-of-the-week). Claim the handle to match the site. Optional later: a single short-form account (TikTok/Reels) only if Instagram posting is already a habit.

**Cadence that a solo operator can keep**

- **1× per week:** Deal of the week — one bike or one component, price + store + “see all on The Dropper,” link in bio to the matching hub or the Friday Drop archive.
- **Optional story:** screenshot of the live hub (eMTB / under-$3k) when inventory is actually dense.
- Profile: the one-liner + `thedropper.shop` + affiliate disclosure in bio.

**Do not:** daily posting, a Twitter/X firehose, or building a content team. If weekly posts do not produce measurable referral sessions after a couple of months of honest posting, pause — do not add platforms.

**Traffic test:** Instagram (or whatever we chose) as a referrer, plus link-in-bio clicks if the host provides them.

### 5. Email — The Friday Drop (owned compounding)

**Job:** Bring people back without Google or Reddit. Named in [DESIGN.md](DESIGN.md); **no list backend yet**. Do not put a fake signup on the site.

**When to start:** after there is a repeating content object (weekly drops template **or** a social cadence) so the first issue is not an empty promise.

**v1 (smallest real newsletter)**

- Provider: any ESP that can send from a thedropper.shop domain (Buttondown, Beehiiv, Resend + a simple form — pick one, do not build a mailer).
- Promise: **one email on Friday** — 5–8 biggest savings (prefer dollars over % off), one category spotlight, optional open giveaway.
- Capture: footer + home, after the first issue has actually gone out. Copy: “The Friday Drop,” not “Email Newsletter.”
- Every module links to a live deals URL (hub/category/deal), not a screenshot-only teaser.

**v2 (product, not marketing):** saved-search / price-drop mail — the feature MTBbot riders asked for. That is a product ticket, not this plan. Marketing email should not wait on auth.

**Do not:** daily alerts, a second list, or validating “signup conversion” before a provider exists.

**Traffic test:** unique clicks from the Friday send (UTM `utm_medium=email&utm_campaign=friday-drop`). List size is a leading indicator, not the goal.

### 6. GEO / AI — supporting, not a traffic bet

Agents will not cite a site they have never retrieved. Follow [ai-agent-citation.md](ideas/ai-agent-citation.md): weekly probe pack, Bing, answer-shaped eMTB intro. Success there is **cited at all**. Do not chase Google AI Overviews until GSC shows real rankings.

If a citation or AI-referrer session appears, then add a PostHog property for those referrers. Not before.

### 7. Giveaways directory — already shipped, use as a hook

`/giveaways` is a reason to return and a reason to post (“open entries this week”). Keep rows fresh so the header link is not empty. Share when something riders actually want is open. We do not run our own sweepstakes in this plan.

### 8. Affiliates and partnerships — not an acquisition channel

Affiliate programs pay for traffic we already earned. Stay compliant (disclosure, link patterns). Do not treat merchant “please feature us” emails as a growth strategy until weekly visitors are real. Display ads are later; they tax UX.

## Sequence (do this order)

No dates. Finish or explicitly skip a step before starting the next.

| Step | Work | Done when |
| --- | --- | --- |
| **0. Measurement** | Confirm Vercel Analytics + PostHog see production; GSC property is `sc-domain:thedropper.shop`; note a one-week baseline of visitors / sources. | You can answer “how many people came this week, and from where?” |
| **1. SEO proof** | Request indexing on the four money URLs; Bing + sitemap; eMTB intro is answer-shaped. | Those URLs are indexed (or we know why not). |
| **2. Community** | One genuine Reddit help-reply or update when there is news; UTM on the links. | At least one non-zero reddit.com week in analytics, or a written “we tried, it did not land.” |
| **3. First article** | Ship ZAC-250 (starter kit) with live deal links; add it to sitemap/nav as appropriate. | URL is live, indexed or submitted, and internally linked from home or `/deals`. |
| **4. Social handle** | Claim Instagram; publish deal-of-the-week using the same picks as the weekly template. | Profile exists; first post links to a live hub. |
| **5. Friday Drop** | ESP + domain auth + first real Friday send, **then** site signup. | Issue 1 sent; capture form goes live the same week. |

Steps 4 and 5 can swap if email is more natural than Instagram — both need the weekly drops template from step 3.

## What we will not do (yet)

- Paid search / social ads (no budget, no proven landing-page conversion).
- A high-volume blog or YouTube channel.
- Programmatic thin pages or every-filter indexation.
- Fake email capture.
- Relying on Reddit as the only plan, or posting there on a schedule.
- Entity/tax structuring as a substitute for visitors ([distribution one-pager](ideas/thedropper-distribution-seo.md)).

## Related work

| Item | Role |
| --- | --- |
| [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228) Create social media presence | Execute channel 4 |
| [ZAC-250](https://linear.app/zacks-personal-projects/issue/ZAC-250) Blog post: products you need to get started | Execute channel 3, first article |
| [ZAC-201](https://linear.app/zacks-personal-projects/issue/ZAC-201) / [ai-agent-citation.md](ideas/ai-agent-citation.md) | GEO supporting work |
| [thedropper-distribution-seo.md](ideas/thedropper-distribution-seo.md) | SEO + business constraints this plan follows |
| [price-band-hub-indexing.md](ideas/price-band-hub-indexing.md) | Hub indexation proof |
| [mtbbot-feedback.md](ideas/mtbbot-feedback.md) | Audience and why community / email alerts matter |
| [DESIGN.md](DESIGN.md) | Voice; “The Friday Drop” naming |

## Open questions

- After two to four weeks of GSC data: is the failure “not indexed,” “indexed but wrong queries (dropper post),” or “right queries, no CTR”? That chooses copy vs hubs vs brand clarification.
- Instagram vs skipping social until Friday Drop has a list — default Instagram first because ZAC-228 exists; revisit if posting is not happening.
- Whether the starter-kit article lives at `/blog/…` or a single `/guides/get-started` URL. Prefer **one guide URL** until there is a second article.
- At what weekly visitor count we bother with paid tests or a second content series. Default: not before organic + email are both producing sessions we can see.
