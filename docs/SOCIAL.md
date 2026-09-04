# The Dropper — social posting plan

**Status:** v1 plan for [ZAC-228](https://linear.app/zacks-personal-projects/issue/ZAC-228). Ads are out of scope.  
**Owner:** Zack (manual)  
**Channels:** Instagram + Reddit  
**Site:** [thedropper.shop](https://thedropper.shop)  
**Created:** 2026-09-04

This is the operating doc for channel 4 in [MARKETING.md](MARKETING.md). Keep it light: one weekly habit, not a second job.

## Accounts

| Channel | Handle / home | Role |
| --- | --- | --- |
| Instagram | [@thedropper.shop](https://www.instagram.com/thedropper.shop/) | Visual presence + weekly posts. Website field → link-in-bio. |
| Reddit | Zack’s existing account | Helpful replies on **r/MTB** and **r/MTBDeals** only. Not a brand page. |

**Do not add** TikTok, X, YouTube, or a second IG account until Instagram has been a weekly habit for a couple of months **and** PostHog shows `instagram.com` (or link-in-bio) referrals that reach `/deals` or a hub.

Later, if IG is already a habit: one short-form account (Reels/TikTok) recycling the same weekly pick. Not before.

## Instagram — set this once

Instagram cannot be updated from this repo. Paste the following in the app (Edit profile).

**Name:** The Dropper  
**Username:** `thedropper.shop` (already claimed)  
**Category:** Shopping & retail (or Sporting goods)

**Bio** (fits the 150-character limit; same one-liner as the site):

```
Every MTB sale. One feed.
US shops · live prices.
Some links earn a commission.
```

**Website (the only link Instagram allows):**

```
https://thedropper.shop/links?utm_source=instagram&utm_medium=social&utm_campaign=link-in-bio
```

That URL is the in-app **link-in-bio** page (`/links`, `noindex`). It lists live destinations only:

- Browse all deals → `/deals`
- Mountain bikes → `/deals/c/bikes/mountain`
- eMTBs → `/deals/c/bikes/emtb`
- Bikes under $3,000 → `/deals/hub/mountain-bikes-under-3000`
- eMTBs under $5,000 → `/deals/hub/emtbs-under-5000`
- Giveaways & raffles → `/giveaways`

Add Friday Drop and the get-started article to that list when [ZAC-260](https://linear.app/zacks-personal-projects/issue/ZAC-260) and [ZAC-250](https://linear.app/zacks-personal-projects/issue/ZAC-250) ship. Do not invent a signup or a blog URL before then.

Code: [`apps/web/src/lib/linkInBio.ts`](../apps/web/src/lib/linkInBio.ts), page [`/links`](../apps/web/src/app/(public)/links/page.tsx). Footer also links the Instagram profile.

## Cadence

Solo-operator default. Skip a week if inventory is thin — do not post filler.

| When | What |
| --- | --- |
| **1× per week** (Fri or Sat) | One feed post. Rotate formats below. Prefer the same pick you would put in The Friday Drop. |
| **Optional story** | Screenshot of a live hub when it is actually dense (eMTB / under-$3k / a new store’s first scrape). |
| **Reddit** | Reply when someone asks. No schedule. No second “I built an MTBbot replacement” thread. |

If weekly posts do not produce measurable referral sessions after a couple of months of honest posting, **pause**. Do not add platforms.

## Formats

Use the site voice ([DESIGN.md](DESIGN.md)): trailhead, not “Save money!!”. Lead with **MTB deals / sale feed**, not the dropper-post component. Prefer **dollars saved** over % off. Name the store. Link in bio — Instagram will not make the caption URL clickable.

1. **Deal of the week / best save** — one bike or one component; price + store + “more on The Dropper.”
2. **Hub or category highlight** — eMTB, mountain, under-$3k, a brand+category when inventory is real.
3. **New store** — first time a shop lands in the feed; one example listing, not a press release.
4. **Giveaways** — only when `/giveaways` has an open entry riders would actually want.
5. **Blog callout** — after ZAC-250: get-started checklist, later maintenance/reviews. Every item still points at a live `/deals` URL.
6. **Friday Drop teaser** — after ZAC-260: “issue N is out” + one save; website field can stay `/links`.

**Reddit (not a feed dump):** helpful deal replies + occasional Dropper-native post **only** if there is a real story (new store coverage, a dense eMTB week, open giveaways). Same tone. No affiliate-looking titles.

## Starter posts (ship these so the account is not an empty shell)

Screenshots: home, `/deals`, or the matching hub. Crop tight. No stock-smile photos. Pin post 1.

### 1. Intro (first feed post)

> Every MTB sale. One feed.
>
> The Dropper watches US mountain-bike shops and puts the live sale prices in one place — bikes, eMTBs, parts, gear. We don’t sell anything. We send you to the retailer.
>
> Link in bio → thedropper.shop
>
> Some links earn a commission. Prices change; confirm at checkout.
>
> #mtb #mountainbike #mtbdeals #emtb

### 2. Deal of the week (template — fill from a live listing)

> [Product] at [Store] — $[sale] (was $[orig], $[saved] off).
>
> In stock when we last checked. Full listing + the rest of this week’s saves: link in bio.
>
> #mtbdeals #mtb #[brand]

### 3. eMTB hub

> eMTBs on sale, one list.
>
> Full-power and lightweight builds under $5k when shops mark them down. Inventory moves with each scrape.
>
> Link in bio → eMTBs under $5,000
>
> #emtb #electricmtb #mtbdeals

### 4. Mountain / under-$3k (use whichever hub is denser that week)

> Mountain bikes on sale across the shops we scrape — not one catalog.
>
> If you’re hunting under $3k, that list is in the bio.
>
> #mtb #mountainbike #mtbdeals

### 5. Giveaways (only if something is open)

> Open entries this week on the giveaways page — enter on the host site. We don’t run these or pick winners.
>
> Link in bio → Giveaways
>
> #mtb #giveaway

### 6. Hold for later tickets

- **Get-started checklist** — after ZAC-250. Caption: returning-rider kit; every item is a live category, not a static pick.
- **Friday Drop #1** — after ZAC-260. Caption: “The Friday Drop is out” + one save. Do not tease a list that cannot be joined yet.

## Reddit replies (copy, then add a specific URL)

Use `?utm_source=reddit&utm_medium=social&utm_campaign=reply` on the URL you share.

**“Where do I find MTB sales?” / “is there a deals site?”**

> I use The Dropper for that — live sale prices from a bunch of US MTB shops in one feed: https://thedropper.shop/deals?utm_source=reddit&utm_medium=social&utm_campaign=reply
>
> Category pages if you already know what you want (e.g. eMTBs: https://thedropper.shop/deals/c/bikes/emtb?utm_source=reddit&utm_medium=social&utm_campaign=reply). Confirm price/stock on the retailer.

**“Is mtbbot dead? What replaced it?”**

> mtbbot’s been down a while. The Dropper is a similar idea — one MTB sale feed, bookmark the category you care about: https://thedropper.shop/deals?utm_source=reddit&utm_medium=social&utm_campaign=reply
>
> I’m the one who built it. Not a dump of today’s deals; the site stays updated.

**Out:** another launch thread on r/MTB or r/MTBDeals. Already tried ([`1v2t40h`](https://www.reddit.com/r/MTB/comments/1v2t40h/i_created_a_mtbbot_replacement/), [`1v2tdce`](https://www.reddit.com/r/MTBDeals/comments/1v2tdce/i_created_a_mtbbot_replacement/)). Low traction. See [MARKETING.md](MARKETING.md#2-community--reply-when-asked-not-a-launch-engine).

## Measurement

Friday readout ([MARKETING.md](MARKETING.md#weekly-readout-zac-259)):

- PostHog **Visitors by referring domain** — look for `instagram.com` / `l.instagram.com` and `reddit.com`.
- PostHog events on `/links`: `link_in_bio_viewed`, `link_in_bio_clicked` (`link_id`, `href`).
- Instagram’s own insights are vanity until a referrer session hits a money page.

## Operator checklist (ZAC-228 remaining)

Repo work is the plan + `/links` + footer Instagram + `sameAs` on the WebSite JSON-LD. Still on Zack:

1. Paste the bio and website URL above into Instagram.
2. Publish posts 1–3 (and 4 or 5 if inventory/giveaways justify it). Pin the intro.
3. Next time r/MTB or r/MTBDeals asks for a deals list or mtbbot replacement, use a reply template — do not start a new launch thread.
