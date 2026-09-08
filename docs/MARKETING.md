# The Dropper — marketing plan

**Status:** Written plan (ZAC-258). Step 0 (measurement) is in place ([ZAC-259](https://linear.app/zacks-personal-projects/issue/ZAC-259)). Campaigns are not launched yet.  
**Site:** [thedropper.shop](https://thedropper.shop)  
**Owner:** Zack  
**Created:** 2026-09-04

This is the go-to-market plan. Technical SEO, GEO, and product distribution details stay in the linked docs; this file decides **what we do for growth, in what order, and how we know it worked**.

## Situation

The Dropper is a live US-focused MTB deals aggregator: multi-store sale pages, category/brand/price hubs, filters, price history, and a curated [giveaways](https://thedropper.shop/giveaways) directory. Monetization is **affiliate-first**. The product already does the job MTBbot proved riders want — one fast sale feed.

Reddit has been tried as a launch channel and **did not move the needle**. Same post, two subs, little traction: [r/MTB](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/) and [r/MTBDeals](https://www.reddit.com/r/MTBDeals/comments/1v2tdce/i_created_a_mtbbot_replacement/). Do not treat another “I built the MTBbot successor” thread as a traffic plan.

What is **not** true yet:

- Organic search is not a traffic engine. Google Search Console has shown ~0 deal-intent clicks; impressions skew toward brand-name confusion around “dropper” (the component), not “MTB deals.”
- Instagram [@thedropper.shop](https://www.instagram.com/thedropper.shop/) exists; the posting plan and `/links` bio page are in [SOCIAL.md](SOCIAL.md). First feed posts are still manual (Zack). There is **no email list / Friday Drop backend** and **no blog**.
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

## Weekly readout (ZAC-259)

Bookmark **[Weekly marketing readout](https://us.posthog.com/project/355496/dashboard/2066236)** (project *The Dropper*, pinned, tags `marketing` / `zac-259`). Product-behavior tiles stay on [Analytics basics](https://us.posthog.com/project/355496/dashboard/1395138).

**Friday check (about five minutes)**

1. Open the dashboard. Read **Weekly unique visitors** (north star) and **Weekly deal outbound clicks** (quality). Calendar weeks are **UTC Sunday–Saturday**; the current week is marked partial.
2. Scan **Visitors by referring domain (14d)** for Reddit / Google vs `$direct`. `thedropper.shop` is internal hops, not a channel.
3. GSC is still **manual**: [Search Console](https://search.google.com/search-console) property `sc-domain:thedropper.shop` → Performance → last 7 days → clicks and impressions. No GSC API in this repo.
4. Optional second visitor count: Vercel Analytics (Hobby). Do **not** expect `deal_outbound_click` there — custom events need Pro; PostHog is the source of truth for outbound.

**Sources**

| Metric | Source of truth | Notes |
| --- | --- | --- |
| Weekly unique visitors | PostHog `$pageview` unique users, weekly | [OpUInR4V](https://us.posthog.com/project/355496/insights/OpUInR4V). Filter test accounts on. |
| Returning vs new | PostHog lifecycle (identified only) + week-over-week uniques | [kSiWEmig](https://us.posthog.com/project/355496/insights/kSiWEmig) stays at **zero** while shoppers are anonymous. Compare this week’s unique visitors to last week until we identify users. Vercel “returning” is a backup. |
| `deal_outbound_click` | PostHog | [tgi4n48V](https://us.posthog.com/project/355496/insights/tgi4n48V) — totals + unique clickers. Cards and PDP both fire this event. |
| Referral domain | PostHog `$referring_domain` | [wvcbgHqI](https://us.posthog.com/project/355496/insights/wvcbgHqI) |
| Organic clicks / impressions | Google Search Console `sc-domain:thedropper.shop` | Manual. Plan already notes ~0 deal-intent clicks. |
| Second visitor count | Vercel Web Analytics | Hobby pageviews/visitors only. |

**Baseline captured 2026-09-04** (test accounts filtered; PostHog timezone UTC)

| Window | Unique visitors | Outbound clicks (events / unique clickers) |
| --- | --- | --- |
| Week of 2026-08-23 | 28 | 113 / 11 |
| Week of 2026-08-30 (partial through Sep 4) | 51 | 126 / 18 |

Last-14d unique visitors by `$referring_domain` (2026-08-21 → 2026-09-04): `$direct` 56, `thedropper.shop` 17, `github.com` 8, `www.reddit.com` 6, `com.reddit.frontpage` 2, `www.google.com` 2, `search.google.com` 1, `vercel.com` 1.

Store-referral funnel on the same dashboard ([FxucFAfI](https://us.posthog.com/project/355496/insights/FxucFAfI), last 30d, 30-minute window): 76 people `deal_detail_viewed` → 45 `deal_outbound_click` (59%). Card-level snags without a PDP view are **not** in this funnel — use the weekly outbound tile for total shop-outs.

Vercel Web Analytics (Hobby) for 2026-08-28 → 2026-09-04: **67 visitors / 594 pageviews**. Same window as a rolling week, not the PostHog Sunday-start week — expect the counts to differ.

GSC clicks/impressions were **not** pulled in this baseline (no API). Fill that cell the first Friday you open Search Console.

**Email:** PostHog subscription [Weekly marketing readout](https://us.posthog.com/project/355496/dashboard/2066236) → `zpipe07@gmail.com`, every **Monday 13:00 UTC** (subscription `143550`). Charts only — no AI summary. A test send was fired on create. Manage or pause under [Subscriptions](https://us.posthog.com/project/355496/subscriptions).

## Positioning

**One line (already on the site):** “Every MTB sale. One feed.”

**Who we are talking to**

1. **Deal hunters** who already bounce Jenson / WWC / CC / Evo looking for Fox, SRAM, tires, or a complete bike on sale.
2. **Returning or first-bike riders** who need a starter kit and a trustworthy price, not a magazine review.
3. **Bookmark people** — the MTBbot user. They want a URL they can reopen on Friday night, not a feed they have to remember to follow.

**What we are not:** Pinkbike, Vital, or a “best eMTB 2026” publisher. We win when the page shows **live cross-retailer prices with a date**. Editorial copy exists to send people into that inventory.

**Name risk:** “The Dropper” is memorable on trail, easy to confuse in search with dropper seatposts. Brand queries will stay messy. Acquisition copy should lead with **MTB deals / sale feed**, not the component.

## Channel strategy

Priority for a solo operator: **SEO (compounding)**, then **one content asset**, then **social handle + Friday Drop** once there is something worth repeating. Community stays a **reply-when-asked** channel, not a launch bet — we already posted.

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

### 2. Community — reply when asked, not a launch engine

**Job:** Be findable when someone is already looking for a deals list. Not: manufacture a second launch spike.

MTBbot grew on Reddit. The Dropper already posted there and it **did not get traction** — [r/MTB `1v2t40h`](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/) and [r/MTBDeals `1v2tdce`](https://www.reddit.com/r/MTBDeals/comments/1v2tdce/i_created_a_mtbbot_replacement/). A cold “I built this” thread is a spent move on both the general and the deals-specific sub. Community stays **experimental and low-volume**.

**In**

- **r/MTB** and **r/MTBDeals** only. Reply when someone asks “where do I find sales?” or “is mtbbot dead?” with the site and a specific category/hub URL — not a generic homepage dump. Keep the name in the reply; people forgot “mtbbot” and searched by description.
- At most one useful follow-up **if** there is a real story (new store coverage, a dense week of eMTB closeouts, giveaways strip actually has open entries). Same tone as the product: no fluff. Not another replacement announcement.

**Out**

- Another launch / “MTBbot replacement” post on r/MTB, r/MTBDeals, or anywhere else. We ran that experiment on both.
- Daily deal dumps, affiliate-looking titles, or brigading.
- Making Reddit the **plan**, or counting on a post to refill the funnel.

**Traffic test:** incidental reddit.com referrals that reach `/deals` or a hub (PostHog). Do not hold other channels for a Reddit win.

### 3. Content — few pages that point at live deals

**Job:** Give search and social something shareable that is not another empty “blog.”

There is no blog route today. Do not stand up a magazine. Ship **one or two indexable articles** that deep-link to current `/deals` filters and hubs.

**First piece (already ticketed):** [ZAC-250](https://linear.app/zacks-personal-projects/issue/ZAC-250) — “products you need to get started.” Frame it as a **returning-rider / first-bike checklist** (bike or a sane used-bike note, helmet, shoes, pedals, dropper, tires, pack/tool). Every item links to the live category or a filtered deals URL, not a static product pick that goes stale. Date the page (“prices as of …”) and re-scrape mentally when inventory shifts.

**Second piece (only after the first is live and linked):** a single recurring format — **“This week’s drops”** — 5–8 listings with savings dollars, store, and in-stock honesty. That template becomes Friday Drop + Instagram fodder. Do not invent a new format each week.

**Later / maybe:** seasonal “when to buy” (Black Friday → spring) once we have price-history stories worth telling. Industry-data ticket [ZAC-17](https://linear.app/zacks-personal-projects/issue/ZAC-17) is product, not a reason to write eight guides.

**Do not:** “Best mountain bikes under $3000” essays that compete with publishers. The hub **is** that page.

**Traffic test:** sessions landing on the article and click-through to `/deals/c/…` or outbound.

### 4. Social — light presence, not a second job

**Job:** Be findable and have a place to put the weekly drops. Ticket: [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228). Operating doc: [SOCIAL.md](SOCIAL.md).

**v1 channels:** Instagram ([@thedropper.shop](https://www.instagram.com/thedropper.shop/)) + Reddit replies. Website field → [`/links`](../apps/web/src/app/(public)/links/page.tsx) (link-in-bio, `noindex`). Optional later: a single short-form account (TikTok/Reels) only if Instagram posting is already a habit.

**Cadence that a solo operator can keep** (detail and starter captions in [SOCIAL.md](SOCIAL.md))

- **1× per week:** one feed post. Rotate deal of the week / best save, hub or category highlight, new store, open giveaways; blog and Friday Drop teasers after those tickets ship.
- **Optional story:** screenshot of a live hub when inventory is actually dense.
- **Reddit:** reply when asked (templates in SOCIAL.md). No schedule. No second launch thread.
- Profile: one-liner + affiliate line in bio; website = `thedropper.shop/links` with UTM.

**Do not:** daily posting, a Twitter/X firehose, or building a content team. If weekly posts do not produce measurable referral sessions after a couple of months of honest posting, pause — do not add platforms.

**Traffic test:** `instagram.com` / `l.instagram.com` as a referrer on the weekly readout, plus PostHog `link_in_bio_viewed` / `link_in_bio_clicked`.

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
| **0. Measurement** | Confirm Vercel Analytics + PostHog see production; GSC property is `sc-domain:thedropper.shop`; note a one-week baseline of visitors / sources. | **Done 2026-09-04.** [Weekly marketing readout](https://us.posthog.com/project/355496/dashboard/2066236) + baseline in this doc. GSC remains a manual Friday cell. |
| **1. SEO proof** | Request indexing on the four money URLs; Bing + sitemap; eMTB intro is answer-shaped. | Those URLs are indexed (or we know why not). |
| **2. First article** | Ship ZAC-250 (starter kit) with live deal links; add it to sitemap/nav as appropriate. | URL is live, indexed or submitted, and internally linked from home or `/deals`. |
| **3. Social handle** | Instagram bio + `/links`; weekly post from [SOCIAL.md](SOCIAL.md). | Bio/website set; first three feed posts live; Reddit stays replies-only. |
| **4. Friday Drop** | ESP + domain auth + first real Friday send, **then** site signup. | Issue 1 sent; capture form goes live the same week. |

Reddit launch is **already done** (low traction on [r/MTB `1v2t40h`](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/) and [r/MTBDeals `1v2tdce`](https://www.reddit.com/r/MTBDeals/comments/1v2tdce/i_created_a_mtbbot_replacement/)). Do not insert another community step in this sequence. Replies-only, opportunistic.

Steps 3 and 4 can swap if email is more natural than Instagram — both need the weekly drops template from step 2.

## What we will not do (yet)

- Paid search / social ads (no budget, no proven landing-page conversion).
- A high-volume blog or YouTube channel.
- Programmatic thin pages or every-filter indexation.
- Fake email capture.
- Relying on Reddit as the only plan, posting there on a schedule, or another “I built an MTBbot replacement” thread ([r/MTB](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/), [r/MTBDeals](https://www.reddit.com/r/MTBDeals/comments/1v2tdce/i_created_a_mtbbot_replacement/) — already tried).
- Entity/tax structuring as a substitute for visitors ([distribution one-pager](ideas/thedropper-distribution-seo.md)).

## Related work

| Item | Role |
| --- | --- |
| [ZAC-259](https://linear.app/zacks-personal-projects/issue/ZAC-259) Marketing measurement baseline | Weekly readout + first numbers (this doc) |
| [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228) Create social media presence | Execute channel 4 — [SOCIAL.md](SOCIAL.md) |
| [ZAC-250](https://linear.app/zacks-personal-projects/issue/ZAC-250) Blog post: products you need to get started | Execute channel 3, first article |
| [ZAC-201](https://linear.app/zacks-personal-projects/issue/ZAC-201) / [ai-agent-citation.md](ideas/ai-agent-citation.md) | GEO supporting work |
| [thedropper-distribution-seo.md](ideas/thedropper-distribution-seo.md) | SEO + business constraints this plan follows |
| [price-band-hub-indexing.md](ideas/price-band-hub-indexing.md) | Hub indexation proof |
| [mtbbot-feedback.md](ideas/mtbbot-feedback.md) | Audience; includes the low-traction r/MTB (`1v2t40h`) and r/MTBDeals (`1v2tdce`) shares |
| [DESIGN.md](DESIGN.md) | Voice; “The Friday Drop” naming |

## Open questions

- After two to four weeks of GSC data: is the failure “not indexed,” “indexed but wrong queries (dropper post),” or “right queries, no CTR”? That chooses copy vs hubs vs brand clarification.
- Whether weekly IG posts produce referral sessions after a couple of months — if not, pause (do not add TikTok/Reels).
- Whether the starter-kit article lives at `/blog/…` or a single `/guides/get-started` URL. Prefer **one guide URL** until there is a second article.
- At what weekly visitor count we bother with paid tests or a second content series. Default: not before organic + email are both producing sessions we can see.
