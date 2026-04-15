---
name: SEO GEO Monitoring Plan
overview: Establish automated and manual processes to regularly monitor SEO/GEO health, catch regressions, and track progress -- combining CI-integrated checks, periodic manual reviews, and quick-win improvements to address gaps found during the audit.
todos:
  - id: install-gsc-mcp
    content: Install Google Search Console MCP in .cursor/mcp.json and authenticate with Google account
    status: pending
  - id: install-psi-mcp
    content: Install PageSpeed Insights MCP in .cursor/mcp.json (no auth needed)
    status: pending
  - id: llms-txt
    content: Create llms.txt and llms-full.txt in apps/web/public/ for GEO (AI crawler discoverability)
    status: pending
  - id: og-type-fix
    content: Fix openGraph.type on deal detail page from 'website' to something more appropriate
    status: pending
  - id: default-og-image
    content: Add a branded fallback OG image (1200x630) to root layout.tsx
    status: pending
  - id: breadcrumb-jsonld
    content: Add BreadcrumbList JSON-LD builder to jsonLd.ts; render on category and deal detail pages
    status: pending
  - id: deals-page-jsonld
    content: Add ItemList JSON-LD to the main /deals page (currently missing, unlike home and category pages)
    status: pending
  - id: lighthouse-ci
    content: Add Lighthouse CI step to .github/workflows/ci.yml after web build (SEO score threshold 90+)
    status: pending
  - id: seo-smoke-tests
    content: Create lightweight SEO smoke tests (sitemap validation, meta tag checks, JSON-LD presence)
    status: pending
  - id: bing-webmaster
    content: Submit sitemap to Bing Webmaster Tools (manual step, document in README)
    status: pending
isProject: false
---

# SEO/GEO Monitoring and Continuous Improvement Plan

## Current State Summary

The core SEO infrastructure from the [original plan](/.cursor/plans/seo_and_geo_strategy_235800dd.plan.md) is **fully implemented**:

- Dynamic `sitemap.xml` (home + deals hub + all categories + up to 48k deal URLs)
- `robots.txt` with admin disallow
- Per-page metadata (titles, descriptions, canonicals, OG/Twitter) on all public routes
- JSON-LD: `WebSite+SearchAction` (home), `Product+Offer` (deal detail), `ItemList` (categories), `CollectionPage` (/categories)
- Category SEO copy with hand-tuned intros for GEO
- Middleware redirect from `?category=` to `/deals/c/...` (308)

**Gaps identified in this audit:**

- No `llms.txt` / `llms-full.txt` (GEO gap)
- No `BreadcrumbList` JSON-LD (rich results opportunity)
- Deal detail `openGraph.type` is `"website"` instead of `"product"`
- No default OG images in root layout (social sharing fallback)
- No automated SEO regression checks in CI
- Main `/deals` page has metadata but no JSON-LD (unlike home and category pages)

---

## Available Monitoring Tools

### What you already have (free)

| Tool                             | What it tells you                                                                     | How to use                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Google Search Console**        | Impressions, clicks, CTR, avg position, index coverage, rich results, Core Web Vitals | Manual dashboard review; you can provide exports or screenshots |
| **PostHog** (already integrated) | Organic traffic segments, page views, user flows, referrer breakdown                  | Add UTM/referrer tracking; create organic traffic dashboard     |
| **Lighthouse** (local or CI)     | SEO score, CWV, accessibility, structured data validation                             | Add to CI (see below)                                           |

### Recommended additions (free)

| Tool                                     | Purpose                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Bing Webmaster Tools**                 | Bing/Copilot indexing and search data; submit sitemap there too                           |
| **Google Rich Results Test**             | Validates JSON-LD renders correctly for rich snippets (manual spot-check)                 |
| **CrUX Dashboard** (Chrome UX Report)    | Real-user Core Web Vitals aggregated by Google -- available in Search Console or BigQuery |
| **Schema Markup Validator** (schema.org) | Validates structured data against schema.org specs                                        |

### MCP servers to add (all free, open-source)

Several high-quality SEO MCPs exist in the ecosystem that we can install in Cursor:

**1. Google Search Console MCP** (highest priority)

Two strong options -- both MIT-licensed, published March 2026:

- `[google-searchconsole-mcp](https://www.npmjs.com/package/google-searchconsole-mcp)` (by aashish, 600+ GitHub stars, 230 weekly downloads) -- 13 tools, built-in OAuth (no Google Cloud setup required), simple `gsc-mcp-auth` CLI to authenticate. Tools: `query_search_analytics`, `inspect_url`, `list_sitemaps`, `find_keyword_opportunities`, `get_top_pages`, `compare_performance`, `analyze_brand_queries`, `get_keyword_trend`, `export_analytics`, `query_by_search_appearance`, `query_by_search_type`.
- `[mcp-server-google-search-console](https://www.npmjs.com/package/mcp-server-google-search-console)` (by Tobias Hein / artaxo, 121 weekly downloads) -- 9 tools + 3 guided prompts + 2 resources. Supports both Service Account and OAuth auth. Has built-in multi-step SEO workflow prompts like `seo_performance_analysis` and `content_opportunity_analysis`. Cursor config example in their README.

Either would let us query GSC data (impressions, clicks, CTR, position, keyword opportunities, URL indexing status, sitemap health) directly inside Cursor instead of exporting CSVs.

**2. PageSpeed Insights MCP** ([pagespeed-insights-mcp](https://ruslanlap.github.io/pagespeed-insights-mcp/))

17 tools for performance analysis using Google's PageSpeed Insights API. Key tools: `analyze_page_speed`, `get_performance_summary`, `full_report`, `get_full_audit`, `get_visual_analysis`, `get_element_analysis`, `get_javascript_analysis`, `get_image_optimization_details`, `compare_pages`, `batch_analyze`, `crux_summary`. No API key required (uses the public PSI API). Can check CWV, SEO scores, and specific diagnostics (render-blocking resources, third-party impact, image optimization) for any live URL.

**3. SiteAudit MCP** ([siteaudit-mcp](https://pypi.org/project/siteaudit-mcp/))

11 tools for comprehensive SEO, security, and performance audits -- no API keys required. Tools: `full_audit`, `seo_audit`, `security_audit`, `performance_audit`, `lighthouse_audit`, `check_links`, `check_robots_txt`, `compare_sites`, `accessibility_audit`, `schema_validator`, `competitor_gap_analysis`. Python-based (PyPI). The `schema_validator` tool is particularly useful for validating our JSON-LD.

**4. Lighthouse MCP** ([danielsogl/lighthouse-mcp-server](https://github.com/danielsogl/lighthouse-mcp-server))

13+ tools for local Lighthouse audits. Requires Chrome/Chromium locally. Covers performance, accessibility, SEO, security, and resource analysis. Good for deep local audits, but PageSpeed Insights MCP is easier to set up (no Chrome requirement).

Recommended Cursor MCP config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "google-search-console": {
      "command": "npx",
      "args": ["-y", "google-searchconsole-mcp"]
    },
    "pagespeed-insights": {
      "command": "npx",
      "args": ["-y", "pagespeed-insights-mcp"]
    }
  }
}
```

### Paid tools (optional, for deeper analysis)

- **Ahrefs / SEMrush / Moz** -- backlink analysis, keyword tracking, competitor comparison, site audits
- **Screaming Frog** -- full site crawl simulation (free for up to 500 URLs)

---

## Monitoring Cadence

### Automated (every PR/deploy) -- Lighthouse CI in GitHub Actions

Add a Lighthouse CI step to `[.github/workflows/ci.yml](.github/workflows/ci.yml)` that runs against the Next.js build output. This catches SEO regressions before they ship.

Checks to run:

- SEO score (threshold: 90+)
- Performance/LCP (threshold: informational, warn if degraded)
- Structured data present on key templates
- Meta tags present (title, description, canonical, OG)

Implementation: Use `@lhci/cli` with a `lighthouserc.js` config targeting the built app. The CI already does `pnpm --filter @mtb-aggregator/web run build` (line 79 of `ci.yml`), so we'd add a step after it that starts the Next.js server and runs Lighthouse against key URLs.

### Automated (build-time) -- SEO smoke tests

Add a lightweight test (Vitest or a standalone script) that:

- Fetches `/sitemap.xml` from the dev/preview build and validates it's well-formed XML with expected entries
- Checks that key pages return expected `<meta>` tags and JSON-LD in their HTML
- Validates `robots.txt` structure

This can run as part of the existing CI without needing a live API (using mocked data or the build output).

### Weekly (manual, ~15 min)

- **Google Search Console:** Check Performance tab -- note trends in impressions, clicks, CTR, position for target queries ("mountain bike deals", "MTB deals", category keywords)
- **Index coverage:** Check for any new errors (crawl errors, noindex pages that should be indexed, etc.)
- **Rich results:** Check Enhancements tab for structured data validation issues
- **Quick AI check:** Search "mountain bike deals" on Perplexity or Google AI Overview -- note if The Dropper appears

### Monthly (manual, ~30 min)

- **Deeper GSC review:** Compare month-over-month, identify top-growing and declining queries
- **Core Web Vitals:** Check CrUX data in Search Console (needs sufficient traffic)
- **Sitemap health:** Verify sitemap is being fetched by crawlers (GSC Sitemaps tab)
- **Competitor check:** Search key terms, note where competitors rank vs The Dropper
- **GEO check:** Test 5-10 relevant queries across Perplexity, ChatGPT, and Google AI Overviews -- document which ones cite The Dropper

### Quarterly

- **Full Lighthouse audit** on all page templates (home, /deals, /deals/c/..., /deals/[id])
- **Content refresh:** Update `categorySeo.ts` hand-tuned copy if certain categories aren't performing
- **Structured data review:** Check if Google has added new schema types relevant to deal aggregators
- **Backlink analysis** (if using Ahrefs/SEMrush) -- identify link-building opportunities

---

## Quick-Win Improvements to Implement Now

These address the gaps found during the audit and should be done alongside setting up monitoring:

### 1. Add `llms.txt` and `llms-full.txt`

Create `apps/web/public/llms.txt` -- a plain-text summary of what the site is, what data it has, and how to cite it. This is the emerging standard for helping AI crawlers understand your site. `llms-full.txt` provides more detail.

### 2. Fix `openGraph.type` on deal detail

In `[apps/web/src/app/(public)/deals/[id]/page.tsx](<apps/web/src/app/(public)`/deals/[id]/page.tsx>), change `type: "website"` to `type: "article"` or use `product:` namespace for better social sharing and richer AI extraction.

### 3. Add default OG image

Create a branded fallback OG image (1200x630) and set it in `[apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx)` `openGraph.images` so every page has a social sharing image even when no product image exists.

### 4. Add `BreadcrumbList` JSON-LD

Add `buildBreadcrumbJsonLd()` to `[apps/web/src/lib/jsonLd.ts](apps/web/src/lib/jsonLd.ts)` and render it on category pages and deal detail pages. Google uses this for breadcrumb rich results in SERPs.

### 5. Add `ItemList` JSON-LD to main `/deals` page

The home page and category pages have it, but `[apps/web/src/app/(public)/deals/page.tsx](<apps/web/src/app/(public)`/deals/page.tsx>) is missing it.

### 6. Lighthouse CI in GitHub Actions

Add a Lighthouse step after the web build in CI to catch regressions.

---

## Data Collection from Google Search Console

**With the GSC MCP installed**, we can query data directly in Cursor -- no CSV exports needed. The workflow becomes:

1. **Query directly** -- ask for top pages, keyword opportunities, performance comparisons, indexing issues
2. **Analyze** -- I can interpret the data and identify patterns, declining queries, CTR opportunities
3. **Adjust** -- update `categorySeo.ts` copy, add new JSON-LD types, tweak meta descriptions based on live data

**Without the MCP**, you can still share data manually:

- Export CSV from GSC (Performance > Queries, Performance > Pages, last 3 months)
- Share index coverage summary and Enhancements (rich results) screenshots

---

## Monitoring Dashboard (PostHog)

Create a PostHog dashboard for organic traffic tracking:

- Filter by `$referrer` containing google/bing/duckduckgo
- Track page views on key SEO pages (/deals/c/..., /deals/[id])
- Monitor bounce rate from organic traffic
- Track search-to-deal-click conversion from organic visitors
