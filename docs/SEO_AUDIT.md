# SEO Audit — The Dropper (`thedropper.shop`)

**Issue:** ZAC-113  
**Date:** 2026-06-10  
**Auditor:** Cursor Cloud Agent (code + live-site verification)

## Executive summary

Technical SEO fundamentals are **in good shape after the canonical-host fix** (June 2026): apex host, sitemap, robots, SSR deal pages, breadcrumbs, and conservative Product JSON-LD are all present. The live sitemap lists **4,708 URLs** (4,632 deal detail pages, 66 category pages, 7 SEO hubs, plus static pages).

**Why GSC shows ~20 indexed pages (not thousands):** This is primarily a **recovery lag + prior canonical poisoning** problem, not a missing-sitemap problem. Google previously saw rotating `*.vercel.app` canonicals and `www`/apex conflicts; thousands of URLs landed in “Discovered — currently not indexed” / “Duplicate” buckets. Re-indexing at scale takes **weeks to months** for a young aggregator with limited authority. Google will also **selectively index** deal PDPs — expect a fraction of sitemap URLs to become indexed even when healthy.

**Google Search Console MCP:** Not available in the Cloud Agent environment (no OAuth tokens). Run GSC queries locally after `gsc-mcp-auth` (see [apps/web/README.md](../apps/web/README.md)).

---

## 1. Google Search Console MCP access

| Item | Status |
|------|--------|
| MCP configured in [`.cursor/mcp.json`](../.cursor/mcp.json) | Yes (`google-searchconsole-mcp`) |
| OAuth tokens on this VM (`~/.gsc-mcp/tokens/`) | **No** |
| MCP resources exposed to agent | **None** |

**To enable locally:**

1. Stop anything on port 3000.
2. Run: `npx --yes --package=google-searchconsole-mcp gsc-mcp-auth`
3. Restart Cursor MCP servers.
4. Re-run this audit with tools: `query_search_analytics`, `inspect_url`, `list_sitemaps`, `get_top_pages`.

Until authenticated, use the [GSC web UI](https://search.google.com/search-console) or export Performance → Queries/Pages CSVs.

---

## 2. Live-site verification (2026-06-10)

| Check | Result |
|-------|--------|
| `www` → apex redirect | `308` → `https://thedropper.shop/` |
| `/deals` | `200`, canonical `https://thedropper.shop/deals` |
| Homepage canonical | `https://thedropper.shop/` (not `*.vercel.app`) |
| `robots.txt` | Allows `/`, disallows `/admin/`, sitemap at apex |
| Sitemap URL count | **4,708** `<loc>` entries |
| Sample deal PDP canonical | `https://thedropper.shop/deals/246650` |
| Deal PDP JSON-LD | `BreadcrumbList` + `Product` with `Offer`, `Brand`, `image` |
| `site:thedropper.shop` (web search) | No results (consistent with very low indexation / young domain) |

**Conclusion:** The [canonical-host-indexing-fix](../.cursor/plans/canonical-host-indexing-fix_ec1d09b0.plan.md) appears **deployed correctly**. Remaining indexation gap is GSC recovery + crawl budget, not broken infra.

---

## 3. Why only ~20 indexed pages?

### Root causes (historical — fixed)

1. **Poisoned canonicals** — `NEXT_PUBLIC_SITE_URL` was unset in production; `getSiteUrl()` fell back to `VERCEL_URL` (rotating preview host). Every page, sitemap `<loc>`, and `robots.txt` sitemap line pointed at `*.vercel.app`.
2. **`www` vs apex** — Sitemap submitted on `www`; apex and `www` disagreed; redirect errors and “Duplicate, Google chose different canonical.”

### Ongoing factors (expected)

3. **Crawl budget & site authority** — New/low-authority aggregators rarely get 4k+ PDPs indexed quickly. Google samples sitemap URLs and prioritizes hub/category pages first.
4. **Thin / duplicate PDP templates** — Deal pages share layout; many differ mainly by product name + price. Google may index hubs (`/deals/c/...`, `/deals/hub/...`) before long-tail PDPs.
5. **Aggregator ≠ merchant** — We are not the seller; PDPs compete with retailer pages for the same products.
6. **Recovery timeline** — After “Validate fix” in GSC, allow **2–8+ weeks** before judging index growth. Monitor **Indexing → Pages** weekly.

### What is *not* the problem

- Sitemap missing deal URLs — **4,632 deal URLs** are in `/sitemap.xml`.
- Client-side rendering — Deal pages are **SSR/ISR** (`revalidate = 14400`).
- `robots.txt` blocking deals — Only `/admin/` is disallowed.

---

## 4. Merchant / product listings (structured data)

### Current implementation

[`apps/web/src/lib/jsonLd.ts`](../apps/web/src/lib/jsonLd.ts) emits per deal PDP:

- `@type: Product` — `name`, `brand`, `image`
- `@type: Offer` — `price`, `priceCurrency`, `availability`, `seller` (store name), `url` → **our PDP URL**

Also: full `BreadcrumbList` (6 levels on sample bike), `ItemList` on list/hub pages, `WebSite` + `SearchAction` on home.

### Should we improve merchant listings?

**Yes, cautiously.** Google Product rich results favor **accurate, merchant-complete** data. Improvements that are **low risk**:

| Field | Available in API | Recommendation |
|-------|------------------|----------------|
| `sku` | `store_sku` | Add to Product JSON-LD |
| `description` | Build from meta description text | Add short plain-text description |
| `itemCondition` | Always new for our inventory | `NewCondition` |
| `priceValidUntil` | Optional | Omit unless we track sale end dates |

**Do not rush:**

- `gtin` / `mpn` — Only if reliably extracted; wrong GTIN hurts trust.
- Pointing `Offer.url` at affiliate/merchant URLs — Policy/attribution complexity; our PDP as `url` is correct for **our** page as the product landing URL. Use `offers.url` for the buy link only if affiliate rules allow and we accept Google may prefer the retailer.

**Reality check:** Aggregators often get **breadcrumb** rich results before **product snippet** cards. Merchant listing performance should be measured in GSC → **Enhancements → Product snippets** (once MCP or UI is available).

---

## 5. Indexation strategy (what we intentionally index)

Aligned with [docs/ideas/thedropper-distribution-seo.md](ideas/thedropper-distribution-seo.md):

| URL type | In sitemap | Index policy |
|----------|------------|--------------|
| `/`, `/deals`, `/categories` | Yes | Index |
| `/deals/c/<path>` (has deals) | Yes | Index |
| `/deals/c/<path>` (empty category) | No | `noindex, follow` |
| `/deals/hub/<slug>` (≥5 deals) | Yes | Index |
| `/deals/hub/<slug>` (thin) | No | `noindex, follow` |
| `/deals/<id>` (PDP) | Yes (up to 48k) | Index (Google selects subset) |
| `/deals?q=…`, `?brand=…`, `?offset=…` | No | Canonical → `/deals` or category path; **consider explicit `noindex` on filtered views** |

**Gap:** Filtered `/deals` URLs canonicalize to `/deals` but lack `robots: noindex`. Low priority crawl waste; add `noindex, follow` when any filter query param is present (except maybe first-page category paths handled elsewhere).

---

## 6. Additional improvements (prioritized)

### P0 — GSC actions (human, post-deploy)

- [ ] Confirm sitemap in GSC is **`https://thedropper.shop/sitemap.xml`** only (remove `www` submission if still present).
- [ ] **Validate fix** on Indexing → Pages buckets (Duplicate, Discovered not indexed, Redirect error).
- [ ] URL Inspection spot-check: `/`, `/deals`, `/deals/c/bikes`, one PDP from sitemap.
- [ ] Request indexing for `/` and `/deals` only (not bulk PDP).

### P1 — Structured data (code)

- [x] Add `sku`, `description`, and `itemCondition` to `buildProductJsonLd` (branch `cursor/seo-audit-zac113-632c`).
- [ ] Validate with [Rich Results Test](https://search.google.com/test/rich-results) after deploy.

### P2 — Content & hubs (product/SEO)

- [ ] Expand SEO hubs based on **GSC query data** (not filter permutations).
- [ ] Ensure category intros (`categorySeo`) are unique enough to avoid thin-hub penalties.
- [ ] Internal links: hubs ↔ categories ↔ top PDPs (already partially via `SeoHubLinks`, `DealsBrowseFooter`).

### P3 — Technical polish

- [ ] `noindex` on non-canonical filtered list URLs (`/deals?*` with any param).
- [ ] Sitemap index split if URL count approaches 50k (currently ~4.7k — fine).
- [ ] Optional: slug-based PDP URLs for shareability (numeric IDs are fine for SEO if titles are strong).
- [ ] `llms.txt` / GEO monitoring per [seo_geo_monitoring_plan](../.cursor/plans/seo_geo_monitoring_plan_5944ba9f.plan.md).

### P4 — Performance (indirect SEO)

- [ ] PageSpeed / CWV on `/deals` and PDP (ISR `no-cache` on `/deals` in dev miss is normal; check production `age` header).
- [ ] PageSpeed Insights MCP needs `GOOGLE_API_KEY` (see web README).

---

## 7. Monitoring cadence

| Frequency | Action |
|-----------|--------|
| Weekly | GSC → Pages (indexed vs not), sitemap status, top queries |
| Monthly | Compare impressions/clicks; add hubs only when query + inventory justify |
| Per deploy | `curl` canonical + sitemap apex check (see web README) |
| Quarterly | Rich Results spot-check; affiliate compliance review for snippets |

---

## 8. References

- [Canonical host fix plan](../.cursor/plans/canonical-host-indexing-fix_ec1d09b0.plan.md)
- [SEO / GEO monitoring plan](../.cursor/plans/seo_geo_monitoring_plan_5944ba9f.plan.md)
- [Distribution & SEO strategy](ideas/thedropper-distribution-seo.md)
- Implementation: `apps/web/src/app/sitemap.ts`, `robots.ts`, `lib/jsonLd.ts`, `lib/seoHubs.ts`
