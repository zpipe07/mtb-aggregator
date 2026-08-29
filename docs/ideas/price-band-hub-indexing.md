# Price-band hub indexing

## Problem Statement

How might we help **budget bike buyers and deal hunters** find live cross-retailer MTB deals in a price band (e.g. under $3,000) via Google—when our hub is crawlable but **not indexed**, and “best of” SERPs are owned by editorial publishers?

## Recommended Direction

**Direction A — Index and own commercial under-$X intent** (aggregator-first, not editorial guides).

Prove one money hub: `/deals/hub/mountain-bikes-under-3000`. Google Search Console showed **Crawled — currently not indexed** while `/deals/c/bikes/mountain` and `/deals/hub/sram-brakes` were indexed. Fix with:

- Stronger unique on-page copy (commercial “on sale under $X” language)
- Light FAQ module + `FAQPage` JSON-LD on the hub
- Crawlable internal links from indexed home and category pages
- GSC **Request indexing** after deploy

Do not expand the price-band hub matrix or publish “best of” guides until this URL stays indexed and earns impressions.

## Key Assumptions to Validate

- [ ] Google keeps the hub indexed after richer copy + internal links — re-inspect in GSC 1–2 weeks post-deploy
- [ ] Budget buyers query commercial phrases (`under $3000`, `MTB deals`) enough to matter once indexed
- [ ] Deal inventory on the $3k hub stays above the index floor (≥5 listings)
- [ ] Light FAQ/intro is sufficient differentiation from `/deals/c/bikes/mountain` without a full guide

## MVP Scope

**In**

- Enriched under-$3000 hub copy in [`apps/web/src/lib/seoHubs.ts`](../apps/web/src/lib/seoHubs.ts)
- Hub FAQ component + optional `FAQPage` JSON-LD
- `belowIntro` slot on deals pages; Popular searches and category intro render below the deal grid
- Home page global hub links; hub page parent/sibling related links
- Post-deploy GSC indexing request (manual)

**Out**

- New under-$2k / $4k hubs
- Full “best mountain bikes under $3000” editorial articles
- Page-1 rank as 90-day KPI

## Not Doing (and Why)

- **“Best of” guides now** — high effort; wrong primary SERP fight for a new aggregator
- **Hub matrix expansion** — multiplies unknown URLs while flagship hub isn’t indexed
- **Query-param price filters as indexed URLs** — already rejected; use curated hubs only
- **Bulk GSC indexing requests** for every hub — focus on one proof URL first

## Open Questions

- After under-$3000 sticks: under-$1000 bikes hub vs parts hub as second discovery target?
- Does FAQ + related links move Coverage from “currently not indexed” on re-crawl?

## GSC snapshot (Aug 2026)

| URL | Coverage |
| --- | -------- |
| `/deals/hub/mountain-bikes-under-3000` | Crawled — currently not indexed |
| `/deals/c/bikes/mountain` | Submitted and indexed |
| `/deals/hub/sram-brakes` | Submitted and indexed |
| Most other hubs | URL unknown to Google |

See also [`thedropper-distribution-seo.md`](thedropper-distribution-seo.md).
