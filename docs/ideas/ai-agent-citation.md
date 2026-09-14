# AI agent citation (ZAC-201)

## Problem Statement

How might we get The Dropper **named or linked** when someone asks ChatGPT, Claude, Perplexity, or Copilot for the best eMTB (and related MTB) deals — and know whether that is happening — without treating more structured data as a substitute for being discoverable?

## Recommended Direction

**Measure-then-nudge.** The site already has GEO plumbing (`llms.txt`, JSON-LD, category intros, hubs). Google Search Console shows ~0 organic clicks; most impressions are brand-name confusion around “dropper,” not deal intent. Agents will not cite a site they have never retrieved. More schema will not fix that.

Success for this ticket is **cited at all** — an agent names The Dropper or links `thedropper.shop`. Do not chase Google AI Overviews yet; those boxes cite sites that already rank. ChatGPT, Claude, Perplexity, and Copilot are the right arena.

Do three things, in order:

1. **Audit** — a fixed prompt pack, run weekly, logged. You cannot optimize what you cannot see.
2. **Index wedge** — Bing Webmaster Tools (not set up yet). Copilot uses Bing’s index; Perplexity often retrieves via Bing. This is Google Search Console for Microsoft’s web. It does not rewrite pages; it tells Bing the site exists.
3. **One citable page** — the existing eMTB category URL [`/deals/c/bikes/emtb`](https://thedropper.shop/deals/c/bikes/emtb). Make the intro answer-shaped: on sale as of {date}, N in-stock listings, price range, two or three examples. Do not add a new `/deals/hub/emtb-...` URL.

Live cross-retailer prices with a date are the only fact Pinkbike, Jenson, and Competitive Cyclist do not already own. If the page does not state current deals, there is nothing to cite.

## Key Assumptions to Validate

- [ ] **Browsing agents can fetch the site** — `curl` `/llms.txt` and `/deals/c/bikes/emtb` with GPTBot / PerplexityBot / ClaudeBot user-agents; expect 200 and real HTML, not a challenge page. If this fails, markup is irrelevant.
- [ ] **Bing will crawl after Webmaster setup** — verify the property, submit `https://thedropper.shop/sitemap.xml`, check Index Explorer within 1–2 weeks.
- [ ] **“Cited at all” can happen without ranking #1** — a factual eMTB page plus `llms.txt` is enough for at least one agent to name or link us on the probe pack. Test after Bing has had time to crawl; do not judge week one.
- [ ] **Dated inventory copy is what gets quoted** — after the eMTB intro states count / range / examples, re-run the probe pack and compare citation rate to the baseline log.

## MVP Scope

Operator work plus one small copy/data change. Not a feature sprint.

**In**

- **Citation probe pack** (below). Run ChatGPT, Claude, Perplexity, and Gemini. Log every run.
- **Crawl smoke** on `llms.txt`, `/deals/c/bikes/emtb`, and one deal detail URL.
- **Bing Webmaster Tools** (first-time, ~15 min, no code):
  1. Sign in at [Bing Webmaster Tools](https://www.bing.com/webmasters) with a Microsoft account.
  2. Add `https://thedropper.shop` or domain `thedropper.shop`.
  3. Verify — prefer **import from Google Search Console** if offered (`sc-domain:thedropper.shop` already exists). Otherwise a DNS TXT at Porkbun.
  4. Submit sitemap `https://thedropper.shop/sitemap.xml`.
  5. **IndexNow:** after the key file is live at `https://thedropper.shop/5130963c54f0f6fab8dede8ea6f6e38c.txt`, connect/verify that key in Webmaster (the Dropper submits production URLs via `/cron/indexnow` and admin revalidate).
  6. Check crawl/index later. Do not expect citations the same day.
- **Answer-shaped eMTB intro** on the existing `bikes-emtb` copy in [`apps/web/src/lib/categorySeo.ts`](../../apps/web/src/lib/categorySeo.ts) — dated count, price range, 2–3 example deals. Pick this _or_ a live markdown snapshot linked from `llms.txt`, not both in v1.
- **Weekly log** (spreadsheet or appendix): date, agent, prompt, cited Y/N, URL if any, other sources named.

**Out of v1**

- A second answer surface (markdown feed _and_ intro rewrite).
- PostHog AI-referrer dashboards (add once a citation or click exists).

### Probe pack

Run each prompt in a **new chat** (no prior The Dropper context). Record the first answer only.

eMTB (primary):

1. What are the best electric mountain bike deals right now?
2. Where can I find cheap in-stock eMTBs on sale?
3. Best full-power eMTB closeouts this week?
4. Lightweight eMTB deals under $5,000?
5. Compare eMTB sale prices across retailers.
6. What’s the cheapest in-stock electric mountain bike on sale?

Controls (keep the pack honest):

7. Best mountain bike deals right now
8. MTB component deals this week
9. Fox fork sale prices
10. Where should I look for mountain bike discounts besides the brand’s own site?

### Log columns

|      Date       |   Agent   |  Prompt #  |  Cited The Dropper?  |  Linked URL  | Other sources named                                                       | Notes   |
| :-------------: | :-------: | :--------: | :------------------: | :----------: | :------------------------------------------------------------------------ | :------ |
|   2026-08-12    |  ChatGPT  |     1      |          No          |     n/a      | Scheels, Upway, Backcountry, Competitive Cyclist, Jenson                  |         |
| :-------------: | :-------: | :--------: | :------------------: | :----------: | :--------------------------------------------------                       | :------ |
|   2026-08-12    |  ChatGPT  |     3      |          No          |     n/a      | Backcountry, thebikeshop, fanatikbike, eriksbikeshop, competitive cyclist |         |
| :-------------: | :-------: | :--------: | :------------------: | :----------: | :--------------------------------------------------                       | :------ |
|   2026-08-12    |  ChatGPT  |     4      |          No          |     n/a      | Incycle, Epic Cycles, Goodwynns, Pro Bike Supply                          |         |

## Not Doing (and Why)

- **More JSON-LD / richer Product schema sitewide** — already shipped (WebSite, Product/Offer, ItemList, FAQPage, CollectionPage). Extra markup will not create authority. The [distribution one-pager](./thedropper-distribution-seo.md) already warned against aggressive Offer markup for aggregators.
- **Google AI Overviews as the first surface** — AIO cites sites that already rank. GSC has ~0 clicks. A later prize, not this ticket.
- **MCP server or public deals API** — nobody calls an API for a site they do not know. Revisit if agents start citing us and need structured fetch.
- **Editorial “best eMTB deals” guides** — thin content risk; we are an aggregator, not a magazine. Dated inventory on the live category page is the citation hook.
- **Expanding the hub matrix for GEO** — same as the distribution one-pager: expand only where demand + inventory justify it. **ZAC-232** later added a curated price-band hub at [`/deals/hub/emtbs-under-5000`](../../apps/web/src/lib/seoHubs.ts) (`bikes-emtb` + `max_price=5000`) because $5,000 is a competitive eMTB price point; that hub is a buyer-intent landing page, not a replacement for the category URL’s dated intro.

## Open Questions

- After the first probe run: is the failure “never crawled,” “crawled but not trusted,” or “trusted but the page is not answer-shaped”? That diagnosis decides whether the next ticket is Bing/crawl, copy, or (only then) more technical GEO.
- Should v1 rewrite the `bikes-emtb` intro in `categorySeo.ts`, or emit a small live markdown that `llms.txt` points at? Default: **intro rewrite** — it helps humans and agents on the same URL.
- At what citation rate (e.g. 1 hit in 40 agent×prompt cells) do we invest in a second category (mountain bikes) vs keep probing eMTB only?
