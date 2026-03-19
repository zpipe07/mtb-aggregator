---
name: Next.js Migration Plan
overview: Step-by-step plan to migrate the React + Vite SPA to Next.js App Router with SSR/ISR for SEO/GEO. Converts the deal modal to a dedicated Server Component page at /deals/[id].
todos: []
isProject: false
---

# Next.js Migration Plan (Updated)

## Deal Detail: Modal → Dedicated Page

**Yes — convert the deal modal to a dedicated page now and use Server Components.**

### Why

- **SEO:** Each deal gets its own URL (e.g. `/deals/12345`) that crawlers can index
- **Shareability:** Users can share direct links to deals
- **GEO:** AI assistants can cite specific deal URLs
- **Simplicity:** No TanStack Query for deal detail; server fetch only

### Implementation

1. **New route:** `app/deals/[id]/page.tsx`

- Server Component; `id` from `params`
- Fetch deal + price history on server via `fetchDeal(id)` and `fetchPriceHistory(id)`
- Add `revalidate = 60` for ISR
- Add `generateMetadata({ params })` for dynamic title/description (product name, price, store)

1. **DealCard changes:** Replace `onSelect` with `Link` to `/deals/[id]`

- Remove modal trigger; card links directly to the deal page
- Keep analytics `track("deal_card_click")` on the link click

1. **DealsPage changes:** Remove `DealDetailModal`, `selectedDealId`, `?deal=` query param

- Deals list no longer manages modal state
- Optional: add "Back to deals" link on deal page that preserves filter state (e.g. `?category=brakes`)

1. **DealDetailModal → DealDetailPage:** Refactor [DealDetailModal.tsx](apps/web/src/components/DealDetailModal.tsx) into `app/deals/[id]/page.tsx`

- Move layout and content into the page
- Replace `useDeal` / `usePriceHistory` with server-side `await fetchDeal(id)` and `await fetchPriceHistory(id)`
- Price chart (recharts) stays in a Client Component (e.g. `PriceHistoryChart`) because recharts needs browser APIs
- Rest of the page (product info, CTA, specs) can stay as Server Component

### URL Structure

- **Simple:** `/deals/[id]` (e.g. `/deals/12345`) — sufficient for v1
- **SEO-friendly (later):** `/deals/[id]/[slug]` (e.g. `/deals/12345/sram-gx-eagle-groupset`) — slug from product name, optional for now

### Data Fetching Summary

| Page             | Strategy                                                         | TanStack Query?                    |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Home             | Server Component + fetch                                         | No                                 |
| Deals list       | Server Component + fetch (filter changes = URL = server refetch) | No                                 |
| Deal detail      | Server Component + fetch                                         | No                                 |
| Deal price chart | Client Component (recharts)                                      | No (pass data as prop from server) |
| Admin            | Client Components                                                | Yes (reads + mutations)            |

---

## Rest of Migration (Unchanged)

Phases 1–8 from the original plan remain: project setup, routing, layouts, Home/Deals page migration, admin section, metadata/SEO, build/Storybook, cleanup. The deal page is now a first-class route from the start rather than a post-migration add-on.
