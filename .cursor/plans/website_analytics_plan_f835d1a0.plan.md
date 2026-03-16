---
name: Website Analytics Plan
overview: "A recommendation for tracking analytics on the MTB aggregator website: what to track, Vercel Analytics fit and limits, and low-cost alternatives."
todos:
  - id: enable-vercel-analytics
    content: Add @vercel/analytics to web app and enable Web Analytics in Vercel dashboard
    status: completed
  - id: add-custom-events
    content: Wire track() calls for deal clicks, filters, search (requires Pro or alternative tool)
    status: completed
isProject: false
---

# Website Analytics Plan

## Recommended Events to Track

For your MTB deals aggregator, these events matter most:

| Priority      | Event                                         | Why                                                                              |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| **Automatic** | Page views                                    | Traffic, top pages (Home vs Deals), conversion funnel                            |
| **Automatic** | Visitors, referrers, devices                  | Where traffic comes from, desktop vs mobile                                      |
| **Custom**    | Deal card click (open modal)                  | Engagement with listings                                                         |
| **Custom**    | "View Deal" / "View at store" click           | **Revenue signal** — users leaving to retailer; essential for affiliate tracking |
| **Custom**    | Filter applied (store, brand, category, sort) | Discovery patterns, what users care about                                        |
| **Custom**    | Search query                                  | What users look for; informs content/features                                    |
| **Custom**    | Category drill-down selection                 | Navigation behavior                                                              |

Page views and visitors are built-in. **Custom events require Vercel Pro or higher** (see below).

---

## Vercel Web Analytics: Fit and Limits

**Out-of-the-box (all plans):**

- Page views, visitors, bounce rate
- Top pages, referrers, country, OS, device, browser
- No cookies (hash-based, privacy-friendly)
- Integrated in Vercel dashboard

**Hobby plan limitations:**

- Custom events are **not available** — you only get page views
- Free event limit; when exceeded, collection pauses for 7 days after a 3-day grace period
- You cannot track clicks or custom interactions on Hobby

**Pro plan ($20/mo per team):**

- Custom events via `track('EventName', { key: value })`
- Billed at $0.00003 per event beyond included events
- Can track deal clicks, filters, search, etc.

**Web Analytics Plus add-on** (Pro only): +$10/mo — more features, longer reporting window.

---

## Cost Comparison: Low-Cost Options

| Tool                   | Cost                   | Custom events | Notes                                                 |
| ---------------------- | ---------------------- | ------------- | ----------------------------------------------------- |
| **Vercel (Hobby)**     | $0                     | No            | Page views only; simple, integrated                   |
| **Vercel (Pro)**       | $20/mo + overage       | Yes           | Best if you're already on Pro                         |
| **Plausible**          | ~$9/mo (10k pv)        | Yes           | Privacy-focused, simple dashboard                     |
| **PostHog**            | Free tier 1M events/mo | Yes           | Product analytics, session replay, generous free tier |
| **Umami Cloud**        | Free tier (limited)    | Yes           | Open-source, can self-host for $0                     |
| **Google Analytics 4** | Free                   | Yes           | Heavy, privacy concerns, complex                      |

---

## Recommendation

1. **Start with Vercel Web Analytics (Hobby)**

- Enable in your Vercel project and add `@vercel/analytics` to [apps/web/src/main.tsx](apps/web/src/main.tsx) or [apps/web/src/App.tsx](apps/web/src/App.tsx)
- Zero cost, page views + visitors + referrers + devices
- Sufficient for early traffic overview

1. **If you need custom events (clicks, filters, search) and stay low-cost:**

- **PostHog** — Free tier (1M events) covers most small sites; events, funnels, session replay
- **Umami** — Free tier or self-host for full control

1. **If you upgrade Vercel to Pro for other reasons** — Add Vercel custom events; `track()` is easy to wire into [DealCard](apps/web/src/components/DealCard.tsx), [DealDetailModal](apps/web/src/components/DealDetailModal.tsx), [DealFilters](apps/web/src/components/DealFilters.tsx), and your search handler.

---

## Implementation Sketch (if using Vercel Pro or alternative)

**Vercel custom events (Pro only):**

```ts
// DealCard.tsx - when user clicks "View Deal"
import { track } from "@vercel/analytics";
// In the View Deal button onClick:
track("view_deal", {
  deal_id: deal.id,
  store: deal.store_name,
  brand: deal.brand,
});
```

```ts
// DealDetailModal - when user clicks "View at store"
track("view_at_store", { deal_id: deal.id, store: deal.store_name });
```

```ts
// DealFilters or filter handlers - when filter changes
track("filter_applied", {
  type: "store" | "brand" | "category" | "sort",
  value: string,
});
```

```ts
// Search - on submit or debounced
track("search", { query: searchQuery });
```

For PostHog/Umami, you'd use their respective `capture()` or `track()` APIs in the same places.

---

## Summary

- **Lowest cost:** Vercel Hobby = page views only, no setup for clicks.
- **Best value for custom events:** PostHog free tier or Umami.
- **Best integration:** Vercel Pro + `track()` for native dashboard and deployment flow.
