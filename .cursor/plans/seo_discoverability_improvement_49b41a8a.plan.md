---
name: SEO Discoverability Improvement
overview: "A phased SEO strategy for thedropper.shop: fix technical leaks, generate programmatic long-tail pages from 11,883 listings, leverage existing price history for differentiation, and expand structured data -- prioritized by effort-to-impact ratio."
todos:
  - id: phase1-technical-fixes
    content: "Phase 1: Fix technical SEO leaks (?from= indexing, llms.txt domain, admin noindex, sitemap resubmit)"
    status: completed
  - id: phase2a-brand-pages
    content: "Phase 2a: Build programmatic brand deal pages at /deals/brand/{slug} with unique metadata, JSON-LD, and noindex threshold"
    status: completed
  - id: phase2b-brand-category-pages
    content: "Phase 2b: Build brand+category intersection pages for high-intent queries"
    status: completed
  - id: phase2c-price-hubs
    content: "Phase 2c: Expand SEO hub strategy with more price brackets and category-specific price pages"
    status: completed
  - id: phase2d-category-copy
    content: "Phase 2d: Enhance category page SEO copy for categories with generic/missing intros"
    status: completed
  - id: phase2e-internal-linking
    content: "Phase 2e: Build internal linking network across brand, category, and deal pages"
    status: completed
  - id: phase3-deal-score
    content: "Phase 3: Implement deal quality scoring algorithm leveraging existing price history data"
    status: pending
  - id: phase3-price-tracker-pages
    content: "Phase 3: Build dedicated price tracker landing pages for popular products"
    status: completed
  - id: phase4a-merchant-feed
    content: "Phase 4a: Generate and submit Google Merchant Center product feed"
    status: completed
  - id: phase4b-structured-data
    content: "Phase 4b: Expand structured data on category/hub pages (Product items in ItemList, AggregateOffer)"
    status: completed
isProject: false
---

# SEO Discoverability Improvement Plan for thedropper.shop

## Problem Statement

How might we make thedropper.shop significantly more discoverable in organic search, transforming it from a near-invisible site (~3 clicks / 3 months) into a destination that captures meaningful traffic from mountain bike deal seekers?

## Current State (GSC Audit Summary)

- **3 total clicks**, ~204 impressions over 90 days -- effectively invisible
- **11,883 visible listings** across 12 scraped retailers -- plenty of inventory for programmatic pages
- **Price history already tracked** and displayed on deal detail pages -- existing data moat
- **0% CTR** on 22 of 24 queries; own brand name "the dropper" ranks at position 24
- **Only 11 pages** receiving any impressions out of thousands of potential URLs
- **Zero backlinks** -- the fundamental authority problem; no external sites link to thedropper.shop
- **www redirect already configured** (308) -- residual `www.` appearances in GSC are stale/cached
- **`?from=` query strings indexed** as separate pages (e.g. `/deals/170253?from=...` despite canonical tag)
- **No rich results** on category/hub pages (only deal detail pages have Product + Merchant listing snippets)
- **Mobile: 0 clicks** from 56 impressions
- `llms.txt` references wrong domain (`thedropper.bike` vs `thedropper.shop`)

## Recommended Direction: Phased "Fix, Scale, Differentiate"

Three phases, ordered by effort-to-impact. Each phase creates conditions for the next.

---

### Phase 1: Fix Technical Leaks (1-2 days, high impact per effort)

These are drag-reducing fixes that currently hurt indexing and authority consolidation.

**1a. Block `?from=` from indexing**

- The canonical tag on deal pages correctly points to `/deals/{id}` without `?from=`, but Google is ignoring it for at least one URL
- Best approach: add middleware that **301 redirects** any `/deals/[id]?from=...` to `/deals/[id]` (stripping the param) when the request comes from a crawler user-agent, OR for all requests (simpler, `?from=` can be read client-side from `document.referrer` or stored in sessionStorage instead)
- Alternative: add `X-Robots-Tag: noindex` header in [next.config.ts](apps/web/next.config.ts) `headers()` for paths matching `/deals/:id*` with `from` query param

**1b. Fix `llms.txt` domain**

- [apps/web/public/llms.txt](apps/web/public/llms.txt) references `thedropper.bike` -- update to `thedropper.shop`
- Also add `/deals/hub/...` and `/deals/brand/...` URL patterns to [llms-full.txt](apps/web/public/llms-full.txt)

**1c. Resubmit sitemap**

- Sitemap was last submitted April 20. After fixes, resubmit via GSC to prompt recrawl
- Consider adding `lastModified` to deal entries using `last_scraped` timestamp for crawl prioritization

**1d. Add explicit admin `noindex`**

- Admin pages currently rely only on `robots.txt disallow`. Add `robots: { index: false }` in admin layout metadata as defense-in-depth ([apps/web/src/app/admin/](apps/web/src/app/admin/))

---

### Phase 2: Programmatic Long-Tail Pages (1-2 weeks, highest growth potential)

Generate SEO-targeted pages from existing structured data. These are the pages that will rank for specific buying queries.

**2a. Brand deal pages** at `/deals/brand/{brand-slug}`

- "Fox deals", "SRAM deals", "Shimano sale" -- generate from your brand list
- Each page = filtered view of `/deals?brand=X` with unique title, description, H1
- Include `ItemList` + `Product` JSON-LD structured data
- `noindex` brands with fewer than 3 deals (same pattern as hubs)
- Source: `GET /brands` endpoint already returns brand list

**2b. Brand + Category intersection pages** at `/deals/brand/{brand}/c/{category}`

- "Fox fork deals", "SRAM drivetrain sale", "Shimano brake deals"
- These match the highest-intent queries (position 1 for "shimano saint hydraulic disc brake caliper" but 0 clicks -- needs a dedicated landing page, not a generic deal detail)
- Only generate for combinations with 3+ deals

**2c. Price range pages / expand hub strategy**

- You already have hubs like "mountain-bikes-under-3000" in [seoHubs.ts](apps/web/src/lib/seoHubs.ts)
- Add more price bracket hubs: under-$1000, under-$500, under-$200
- Add category-specific price hubs: "forks under $500", "wheels under $300"

**2d. Enhance category page SEO copy**

- [categorySeo.ts](apps/web/src/lib/categorySeo.ts) has hand-tuned intros but many categories likely have generic/missing copy
- For each category with deals, ensure unique H1, intro paragraph, and FAQ-style content answering "what to look for in [category]"

**2e. Add internal linking network**

- Brand pages link to relevant category intersections
- Category pages link to top brands within that category
- Deal detail pages link to related deals (same brand, same category)
- This creates a web of internal links that distributes page authority

---

### Phase 3: Leverage Data Moat (2-4 weeks, long-term competitive advantage)

Price history is already being collected and displayed on deal detail pages -- this is a significant existing asset. The goal is to make it work harder for SEO.

**3a. Deal quality score**

- Algorithm based on: discount %, price vs. historical low, product category desirability, stock availability
- Display as a badge/score on deal cards and in JSON-LD structured data
- This gives beginners confidence, creates unique ranking signal, and makes the site more shareable
- Leverage existing price history data to compute "at historical low", "near lowest", "above average" labels

**3b. Dedicated price tracker pages** at `/deals/{id}/price-history` or `/price-tracker/{brand-slug}/{product-slug}`

- Evergreen pages for popular products: "Fox 36 Factory GRIP2 price tracker"
- Rich chart, historical low/high, current deal assessment
- These rank for "[product name] price" and "[product name] deal" queries
- Only generate for products with 30+ days of price history data
- Include `Product` + `Offer` JSON-LD with `priceValidUntil` and `lowPrice`/`highPrice`

**3c. Surface price insights in structured data**

- Add `lowPrice` / `highPrice` to existing `Offer` schema on deal detail pages using price history
- Add `priceValidUntil` based on scrape cadence
- This can trigger Google's "price drop" badge in search results

---

### Phase 4: Distribution Quick Wins (parallel with Phase 2-3)

**4a. Google Merchant Center feed**

- Format existing deal data as a product feed (title, price, image, link, brand, category)
- Submit to Merchant Center -- if accepted, deals appear in Google Shopping results
- Risk: Google may reject aggregators; worth attempting

**4b. Structured data expansion**

- Add `Product` schema items within `ItemList` on category and hub pages (not just deal detail)
- Add `AggregateOffer` on category pages showing price range
- Pursue `DiscountOffer` markup where applicable

---

## Key Assumptions to Validate

- [ ] **Domain authority is sufficient for long-tail ranking** -- Monitor whether new programmatic pages get indexed and start accumulating impressions within 4-6 weeks. If not, the domain needs backlinks before anything else matters. With zero backlinks today, this is the biggest risk. Consider manual outreach to MTB forums/publications as a parallel non-code effort.
- [ ] **Enough deals per page to avoid thin content** -- With 11,883 listings across 12 retailers, most popular brands should have 10+ deals. Run `GET /brands` and check counts before generating pages. Set a minimum of 3 deals to index a brand page.
- [ ] **Google Merchant Center accepts aggregator feeds** -- Submit early to get acceptance/rejection signal. Aggregators are sometimes rejected; the MTB niche specificity may help.
- [ ] **`?from=` parameter fix resolves duplicate indexing** -- Verify via GSC URL inspection 2-3 weeks after deploying the fix.
- [ ] **Programmatic pages don't trigger thin content penalties** -- Each brand/intersection page needs enough unique content (deal count, filtered results, brand-specific copy) to not look like doorway pages.

## The Backlink Problem

The single biggest blocker to SEO growth is **zero backlinks**. Technical SEO and programmatic pages create the conditions for ranking, but Google needs external signals that the site is trustworthy. Potential non-code strategies:

- Submit to MTB deal aggregator lists, cycling directories
- Reach out to Pinkbike, MTBR, Vital MTB forums with genuinely useful deal posts (not spam)
- Create original data analysis ("Average MTB component prices in 2026" using your price history data) that cycling blogs would link to
- Existing price history data is the most linkable asset -- a "State of MTB Deals" report could earn editorial links

## MVP Scope (What to Ship First)

Phase 1 (all items) + Phase 2a (brand pages) + Phase 2e (internal linking). This is the minimum that tests whether programmatic pages can rank for a low-authority MTB domain. If brand pages start getting indexed and accumulating impressions within 6 weeks, proceed to Phase 2b-2d. If not, pause and focus on backlink acquisition.

## Not Doing (and Why)

- **Full blog / buying guide content** -- Too much manual effort for uncertain SEO ROI at current domain authority. Revisit after programmatic pages prove the domain can rank.
- **Email alert system** -- Chicken-and-egg problem. Need traffic before building subscriber infrastructure. Revisit at 1,000+ monthly visitors.
- **Reddit / forum outreach** -- Not a code task. Worth doing manually but outside scope of this plan.
- **Multi-language / international SEO** -- US-focused; not enough volume to justify i18n.
- **AMP pages** -- Google no longer prioritizes AMP for ranking.
- **Video content / YouTube** -- Different channel, different skillset, premature.
- **Pagination `rel=next/prev`** -- Google deprecated this signal in 2019. Canonicalizing filtered URLs to the base path (current behavior) is the correct approach.

## Resolved Questions

- **Deal count**: 11,883 visible listings -- ample for programmatic pages
- **Price history**: Already tracked and displayed on deal detail pages -- Phase 3a/3b from original plan already done
- **www redirect**: Already configured as 308 redirect -- GSC appearances are stale/cached
- **Backlinks**: None -- this is the primary authority gap to address (see "The Backlink Problem" above)
