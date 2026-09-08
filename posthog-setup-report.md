<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into The Dropper MTB Deals web app. The integration covers client-side initialization via `instrumentation-client.ts` (Next.js 15.3+ pattern), a reverse proxy for PostHog ingestion via Next.js rewrites, and 8 custom events spanning the full user journey from discovery through store referral.

## Changes made

| File | Change |
|------|--------|
| `apps/web/package.json` | Added `posthog-js` dependency |
| `apps/web/.env.local` | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |
| `apps/web/src/instrumentation-client.ts` | Initialized PostHog with `/ingest` proxy, error tracking enabled |
| `apps/web/next.config.ts` | Added `/ingest` and `/ingest/static` rewrites to PostHog servers; added `skipTrailingSlashRedirect: true` |
| `apps/web/src/views/HomePageContent.tsx` | Added `search_submitted` event capture |
| `apps/web/src/components/CategoryCard.tsx` | Added `category_clicked` event capture |
| `apps/web/src/views/DealsPageContent.tsx` | Added `filter_applied`, `filters_cleared`, `deals_paginated`, `filter_drawer_opened` event captures |
| `apps/web/src/views/GiveawaysPageContent.tsx` | Added `giveaway_page_viewed` and `filter_applied` (`filter_type: "giveaway_kind"`) |
| `apps/web/src/components/GiveawayCard.tsx` | Added `giveaway_outbound_click` |
| `apps/web/src/components/Toolbar.tsx` | Added `sort_changed` event capture |
| `apps/web/src/app/(public)/deals/[id]/DealDetailContent.tsx` | Added `deal_detail_viewed` event capture (top of store-referral funnel) |
| `apps/web/src/components/ScrollToTop.tsx` | Added `scroll_to_top_clicked` event capture |

## Events instrumented

| Event | Description | File |
|-------|-------------|------|
| `search_submitted` | User submits a search query from the home page hero search form | `apps/web/src/views/HomePageContent.tsx` |
| `category_clicked` | User clicks a category card on the home page to browse deals by category | `apps/web/src/components/CategoryCard.tsx` |
| `filter_applied` | User applies a filter (store, brand, category, min_discount, spec) on the deals page, or a giveaway kind chip (`filter_type: "giveaway_kind"`, `value`: `all` \| `giveaway` \| `raffle`). For **category**, properties include `nav_source` (`breadcrumb` \| `chip` \| `all_clear`), `category_slug` (when set), and `value` (slug or empty) | `apps/web/src/views/DealsPageContent.tsx`, `apps/web/src/views/GiveawaysPageContent.tsx` |
| `giveaway_page_viewed` | User opens the `/giveaways` list | `apps/web/src/views/GiveawaysPageContent.tsx` |
| `giveaway_outbound_click` | User clicks Enter / Get tickets. Properties: `giveaway_id`, `kind`, `status`, `host_name`, `surface` (`home` \| `giveaways`). Do not send `entry_url` or titles | `apps/web/src/components/GiveawayCard.tsx` |
| `sort_changed` | User changes the sort order on the deals page | `apps/web/src/components/Toolbar.tsx` |
| `deal_detail_viewed` | User opens the deal detail page — top of store-referral funnel. Also sends `in_stock_size_count`, `in_stock_color_count`, `in_stock_variant_count` | `apps/web/src/app/(public)/deals/[id]/DealDetailContent.tsx` |
| `deals_paginated` | User navigates to a new page of results | `apps/web/src/views/DealsPageContent.tsx` |
| `filter_drawer_opened` | User opens the mobile filter drawer | `apps/web/src/views/DealsPageContent.tsx` |
| `filters_cleared` | User clears all active filters at once. Property **`had_category_path`**: `true` when the URL was `/deals/c/...` before clearing (category path retained; clears query-backed filters only) | `apps/web/src/views/DealsPageContent.tsx` |
| `scroll_to_top_clicked` | User clicks the floating scroll-to-top control after scrolling down a page. Property **`pathname`**: current route | `apps/web/src/components/ScrollToTop.tsx` |
| `link_in_bio_viewed` | User opens `/links` (Instagram website-field landing) | `apps/web/src/views/LinksPageContent.tsx` |
| `link_in_bio_clicked` | User taps a destination on `/links`. Properties: `link_id` (stable key, e.g. `all_deals`), `href` | `apps/web/src/views/LinksPageContent.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/355496/dashboard/1395138
- **Store referral funnel: deal viewed → snag the deal**: https://us.posthog.com/project/355496/insights/FxucFAfI
- **Discovery: searches and category clicks**: https://us.posthog.com/project/355496/insights/d77QmM2y
- **Filter usage by type**: https://us.posthog.com/project/355496/insights/IQaUoSLn
- **Deal detail views over time**: https://us.posthog.com/project/355496/insights/R3IbmzVV — still charts the retired `view_at_store` event; use **Weekly deal outbound clicks** for live shop-outs
- **Sort preference distribution**: https://us.posthog.com/project/355496/insights/J95ji78g

### Marketing readout (ZAC-259)

Pinned **[Weekly marketing readout](https://us.posthog.com/project/355496/dashboard/2066236)** — weekly unique visitors, outbound clicks, referring domains, plus the store-referral funnel. Friday checklist and the 2026-09-04 baseline live in [docs/MARKETING.md](docs/MARKETING.md#weekly-readout-zac-259). Recurring email: Mondays 13:00 UTC to `zpipe07@gmail.com` (subscription `143550`, no AI summary).

| Insight | URL |
| --- | --- |
| Weekly unique visitors | https://us.posthog.com/project/355496/insights/OpUInR4V |
| Returning vs new visitors (weekly) | https://us.posthog.com/project/355496/insights/kSiWEmig |
| Weekly deal outbound clicks | https://us.posthog.com/project/355496/insights/tgi4n48V |
| Visitors by referring domain (14d) | https://us.posthog.com/project/355496/insights/wvcbgHqI |

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
