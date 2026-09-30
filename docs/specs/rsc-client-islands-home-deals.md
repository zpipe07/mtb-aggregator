# Spec: Shrink `"use client"` on Home and `/deals`

Parent: [ZAC-79](https://linear.app/zacks-personal-projects/issue/ZAC-79/improve-page-speed-on-deals-page) (improve page speed on deals page).

Related: PR [#328](https://github.com/zpipe07/mtb-aggregator/pull/328) (lazy `PriceHistoryChart` / recharts). That PR deferred a **heavy library**. This spec shrinks **page-level client islands** so Home and the deals list stop hydrating markup that is already HTML.

Not in this spec: deal PDP (`DealDetailContent`), admin, `NavHeader` / mega menu, `/giveaways` page shell, `next/dynamic` for `FilterDrawer` / `vaul` (optional follow-up).

## Objective

How might we keep Home and `/deals` looking and behaving the same while hydrating only the controls that actually need the browser?

**Users**

- **Shopper on a phone:** first paint and Time to Interactive on `/` and `/deals` (and category / hub / brand list routes that share `DealsPageContent`).
- **Crawlers:** deal cards stay real `<a>` tags with product names and prices in the HTML (already true; do not regress to `ssr: false` cards).
- **Product analytics:** PostHog / Vercel event names and properties stay stable.

**Success:** A production `next build` reports a **lower First Load JS** for `/` and `/deals` than `main`, with no visual or event-contract change. Cards, category tiles, and giveaway tiles are server-rendered HTML; only small tracked-link / form / filter modules hydrate.

## Why `"use client"` on the page shell is the problem

`"use client"` is contagious. One client parent pulls every import into the page’s hydration bundle.

Today:

```
page.tsx (RSC)
  └── HomePageContent ("use client")
        ├── StatTicker          ← no hooks; hydrated anyway
        ├── SearchBar           ← needs client
        ├── DealCarousel        ← needs client (scroll)
        │     └── DealCard      ← client only for click analytics
        ├── CategoryCard        ← client only for posthog.capture
        └── HomeGiveawaysStrip  ← no directive; GiveawayCard is client
```

```
deals/page.tsx (RSC)
  └── DealsPageContent ("use client")
        ├── FilterSidebar / Toolbar / chips / drawer  ← needs client
        ├── DealsCategoryNav                          ← mostly Links + analytics
        ├── Pagination                                ← onClick → setOffset
        └── DealGrid → DealCard                       ← same as Home
```

`DealCard` is `"use client"` because it calls `usePathname()` and `posthog.capture` / `track()`, not because the layout needs React state. `StatTicker`, `EmptyState`, `DealGrid`, `VariantChips`, `RemoteImg`, and `HomeGiveawaysStrip` have **no** `"use client"` and would already be server components if their parents were.

## Architecture decisions

### 1. Move `"use client"` to leaves, not page shells

Keep client JS only where there is real interactivity:

| Must stay client | Why |
|---|---|
| Home search form | `useState`, `useTransition`, `search_submitted` |
| `SearchBar` | debounce, ⌘K, `track("search")` — add an explicit `"use client"` once Home is RSC |
| `DealCarousel` scroller | `ResizeObserver`, arrow buttons, `home_rail_scrolled` |
| Deals filter chrome | `useFilterParams`, optimistic URL, drawer, pending overlay |
| Tiny tracked links | PostHog / Vercel / sessionStorage on click |

Everything else (hero copy, section headings, `StatTicker`, card chrome, prices, chips, SEO hub slots) is a Server Component.

### 2. Pass RSC cards as `children` into client shells

A Client Component **cannot import** a Server Component. It **can render** server-rendered `children` passed from an RSC parent.

```tsx
// HomePageContent.tsx — Server Component
<DealCarousel ariaLabel="Recent price drops" homeSection="price_drops">
  {priceDropDeals.map((deal) => (
    <DealCard
      key={deal.id}
      deal={deal}
      href={`/deals/${deal.id}`}
      listSurface="home"
      homeSection="price_drops"
    />
  ))}
  <ViewAllDealsCard ... />
</DealCarousel>
```

```tsx
// DealCarousel.tsx — stays "use client", no DealCard import
export function DealCarousel({ children, ... }: { children: React.ReactNode }) {
  return <div ref={scrollerRef} role="list">{children}</div>;
}
```

Same slot on `/deals`: `DealsPageContent` keeps filters; the **results** (`DealGrid` / empty state / pagination) are `children` from the RSC page.

### 3. Do not wrap cards in `next/dynamic` / `ssr: false`

That would hide product names from first HTML and risk CLS. PR 328’s pattern is for **heavy vendor graphs below the fold**, not listing cards.

### 4. Stable analytics: pass `listSurface`, don’t `usePathname()`

`DealCard` uses `usePathname()` only to derive `list_surface`. Parents already know the surface (`home`, `deals_list`, `category`, `hub`, …). Pass it as a prop so the card can be an RSC.

Keep existing events and property names (`deal_card_click`, `deal_outbound_click`, `category_clicked`, `home_view_all_clicked`, `giveaway_outbound_click`, `cta`, `home_section`, counts, etc.). No dashboard break.

### 5. Pagination stays callback-driven in v1

`Pagination` + `setOffset` is inside the deals client chrome and shares `useTransition` / `useOptimistic` with filters. Converting it to `<Link>` would also fix [ZAC-218](https://linear.app/zacks-personal-projects/issue/ZAC-218/make-deal-page-navigations-part-of-browser-history) (history on page changes) but is a behavior change. **Out of v1** so this spec does not mix island splits with navigation semantics.

## Target trees

### Home (after)

```
page.tsx (RSC)
  └── HomePageContent (RSC)
        ├── StatTicker (RSC)
        ├── HomeSearchForm ("use client") → SearchBar
        ├── DealCarousel ("use client")
        │     └── children: DealCard (RSC) + ViewAllDealsCard (RSC)
        ├── CategoryCard (RSC)
        └── HomeGiveawaysStrip (RSC) → GiveawayCard (RSC)
```

Each card uses small client leaves (`TrackedLink` / `TrackedOutboundAnchor`) only on the actual `<a>` / `<Link>`.

### Deals list (after)

```
deals/page.tsx (and c/hub/brand RSC pages)
  └── DealsPageContent ("use client")  // filters + pending overlay only
        ├── FilterSidebar, Toolbar, FilterChips, FilterDrawer
        ├── DealsCategoryNav (can stay client; mostly Links)
        └── children from RSC:
              Pagination (still driven by chrome in v1) OR results slot:
              DealGrid (RSC) → DealCard (RSC)
              EmptyState (RSC)
```

**v1 deals split:** the expensive part is `DealCard` × N. Minimum viable change: RSC pages pass `<DealGrid deals={…} />` (or equivalent) as `children`; `DealsPageContent` stops importing `DealCard`. Filter modules stay in the client bundle (they must).

Hub / brand / category routes already wrap `DealsPageContent` — they get the same children slot.

## Tech stack

Unchanged: Next.js 15 App Router, React 19, PostHog, Vercel Analytics, ISR 4h.

No new runtime dependencies.

## Commands

```bash
pnpm --filter @mtb-aggregator/web exec tsc --noEmit
pnpm --filter @mtb-aggregator/web run lint
pnpm --filter @mtb-aggregator/web run test
pnpm --filter @mtb-aggregator/web run build
# Compare "First Load JS" for `/` and `/deals` (and one `/deals/c/…` if printed)
```

Storybook: `DealCard`, `DealCarousel`, `CategoryCard`, `ViewAllDealsCard`, `GiveawayCard` stories still render.

## Project structure

```
apps/web/src/components/analytics/     # new: tiny client click helpers
  TrackedLink.tsx
  TrackedOutboundAnchor.tsx
apps/web/src/components/DealCard.tsx   # drop "use client"; take listSurface
apps/web/src/components/DealCarousel.tsx  # children slot; stop importing cards
apps/web/src/views/HomePageContent.tsx # drop "use client"
apps/web/src/views/HomeSearchForm.tsx  # new client island
apps/web/src/views/DealsPageContent.tsx    # results via children
apps/web/src/app/(public)/page.tsx
apps/web/src/app/(public)/deals/**/page.tsx
```

## Code style

Composition, not a boolean `isServer` on `DealCard`. Example of the click leaf:

```tsx
"use client";

import Link from "next/link";
import posthog from "posthog-js";

export function TrackedLink({
  href,
  event,
  properties,
  onNavigate,
  children,
  ...rest
}: React.ComponentProps<typeof Link> & {
  event: string;
  properties?: Record<string, unknown>;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        onNavigate?.();
        posthog.capture(event, properties);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
```

`DealCard` stays presentational: compute discount / score / chips on the server, wrap image+title and CTAs with `TrackedLink` / `TrackedOutboundAnchor`. Persist list back-href (`storeDealDetailBackHref`) inside the internal-nav `onNavigate` of that leaf, not in the card shell.

If `Button` + radix `Slot` cannot render from an RSC (event-handler / context), keep `Button` **inside** the small client leaves, not on the card shell.

`SearchBar` uses hooks today but has **no** `"use client"` — it only works because a client parent imported it. Add the directive when Home becomes RSC.

## Testing strategy

- **Vitest:** `listSurface` / href helpers if extracted; existing `filterParams` tests unchanged.
- **Storybook:** card and carousel stories; carousel story passes cards as children.
- **Production build:** First Load JS table in the PR (same bar as #328).
- **Manual:** Home search + rail arrows + View all; `/deals` filter/sort/pagination pending overlay; card “Snag” / “View details”; category tiles; giveaway CTA. Confirm PostHog events still fire with the same names.
- **Do not** use `ssr: false` for cards. Confirm view-source / disable-JS still shows product names.

## Boundaries

- **Always:** keep PostHog event names and discriminating properties; keep crawlable `<Link>` / `<a>` on cards; run `tsc`, lint, vitest, and a production Next build before opening/updating the implementation PR; update `apps/web/README.md` if the Home / deals client-island story changes.
- **Ask first:** changing pagination to `<Link>` (ZAC-218); lazy `FilterDrawer` / `vaul`; shrinking `NavHeader`; converting `DealDetailContent`.
- **Never:** `dynamic(…, { ssr: false })` on `DealCard` / grids; renaming PostHog events “for cleanliness”; pulling admin `recharts` / `@dnd-kit` into this work.

## Success criteria

- [ ] `HomePageContent` has no `"use client"`.
- [ ] `DealCard`, `CategoryCard`, `ViewAllDealsCard`, `GiveawayCard` have no `"use client"` (click tracking in leaf modules).
- [ ] `DealCarousel` does not import `DealCard` or `ViewAllDealsCard`.
- [ ] `DealsPageContent` does not import `DealCard` / `DealGrid`; list RSC pages pass results as `children`.
- [ ] PostHog: `deal_card_click`, `deal_outbound_click`, `category_clicked`, `home_view_all_clicked`, `home_rail_scrolled`, `search_submitted`, `filter_applied`, `deals_paginated` still emit with current properties (`list_surface`, `home_section`, `cta`, …).
- [ ] Production First Load JS for `/` and `/deals` is lower than `main` (record both numbers in the PR).
- [ ] No intentional visual change; Storybook cards still match.

## Open questions

None blocking v1. Optional later: pagination `<Link>` (ZAC-218), `FilterDrawer` dynamic import (~17 kB gzip `vaul`), `DealsCategoryNav` as RSC chips.

---

# Implementation plan

## Overview

Three vertical slices. Each slice leaves Home and `/deals` working. Do not start slice 2 until slice 1’s cards still click and Storybook still renders.

## Task list

### Phase 1: Tracked leaves + DealCard as RSC

#### Task 1: Client click helpers

**Description:** Add `TrackedLink` and `TrackedOutboundAnchor` that wrap `next/link` / `<a>` and fire PostHog (and Vercel `track` where `DealCard` already calls it). Optional `onNavigate` for sessionStorage back-href.

**Acceptance criteria:**
- [ ] Modules are `"use client"` and import `posthog-js` (not the page shells).
- [ ] Outbound helper sets `target="_blank"` + `rel="noopener noreferrer"` like today’s snag button.

**Verification:** `tsc --noEmit`. Story or unit not required if DealCard stories cover clicks next.

**Dependencies:** None

**Files likely touched:**
- `apps/web/src/components/analytics/TrackedLink.tsx` (new)
- `apps/web/src/components/analytics/TrackedOutboundAnchor.tsx` (new)

**Estimated scope:** S

#### Task 2: `DealCard` is an RSC

**Description:** Remove `"use client"`. Replace `usePathname()` with a required `listSurface` prop. Wire internal / outbound clicks through Task 1 helpers. Move `storeDealDetailBackHref` into the internal-nav `onNavigate` at the **call site** or helper so the card does not import sessionStorage if that pulls client APIs — prefer passing `onInternalNavigate` into `TrackedLink` from a tiny wrapper used only on deals list if needed.

Simplest path that stays RSC: `TrackedLink` `onNavigate` calls `onInternalNavigate` from props; deals list passes `() => storeDealDetailBackHref(path)` from a **client** `PersistDealBackLink` that only wraps the card’s links… **or** put `storeDealDetailBackHref` inside `TrackedLink` behind an optional `persistBackHref` string prop (sessionStorage is browser-only; that keeps one client module).

Prefer optional `persistBackHref?: string` on `TrackedLink` so `DealCard` stays a server component with no `dealsBackHref` client import.

**Acceptance criteria:**
- [ ] No `"use client"` in `DealCard.tsx`.
- [ ] Stories still show Default / with href.
- [ ] Call sites pass `listSurface` (`home` on Home, `dealsListSurfaceFromListHref` / path helper on list pages).

**Verification:** Storybook DealCard; `tsc`; click handlers still compile.

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web/src/components/DealCard.tsx`
- `apps/web/src/components/DealCard.stories.tsx`
- `apps/web/src/components/DealGrid.tsx` (thread `listSurface` / persist href)
- `apps/web/src/components/DealCarousel.tsx` (temporary: still imports card until Task 4)

**Estimated scope:** M

#### Task 3: Other analytics-only cards

**Description:** Same pattern for `CategoryCard`, `ViewAllDealsCard`, `GiveawayCard` (`category_clicked`, `home_view_all_clicked`, `giveaway_outbound_click`).

**Acceptance criteria:**
- [ ] Those three files have no `"use client"`.
- [ ] Event names/properties unchanged.

**Verification:** Stories; `tsc`.

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web/src/components/CategoryCard.tsx`
- `apps/web/src/components/ViewAllDealsCard.tsx`
- `apps/web/src/components/GiveawayCard.tsx`
- matching `*.stories.tsx`

**Estimated scope:** M

### Checkpoint: Phase 1

- [ ] `tsc`, lint, vitest pass
- [ ] Cards look the same in Storybook
- [ ] Home and `/deals` still work in dev (carousel may still import DealCard until Phase 2)

### Phase 2: Home is an RSC

#### Task 4: `DealCarousel` children slot

**Description:** Stop importing `DealCard` / `ViewAllDealsCard`. Render `children` as rail items (keep `data-rail-item` / width classes on a wrapper in the carousel so item metrics stay correct). Keep scroll arrows and `home_rail_scrolled`.

**Acceptance criteria:**
- [ ] No card imports in `DealCarousel.tsx`.
- [ ] Overflow / arrow behavior unchanged (`railScroll.test.ts` still passes).
- [ ] Story updated to pass children.

**Dependencies:** Tasks 2–3

**Files likely touched:**
- `apps/web/src/components/DealCarousel.tsx`
- `apps/web/src/components/DealCarousel.stories.tsx`
- `apps/web/src/views/HomePageContent.tsx` (map deals → children; still client until Task 5)

**Estimated scope:** M

#### Task 5: `HomePageContent` server + `HomeSearchForm` client

**Description:** Delete `"use client"` from `HomePageContent`. Extract search state / submit / `search_submitted` into `HomeSearchForm`. Add `"use client"` to `SearchBar`. Pass `listSurface="home"` into cards.

**Acceptance criteria:**
- [ ] `HomePageContent.tsx` has no `"use client"`.
- [ ] Hero search still navigates to `/deals?q=` and emits `search_submitted`.
- [ ] Hub links slot remains RSC children.

**Verification:** Home in browser: search, first rail, category tile, View all, giveaway strip. Production build First Load JS for `/`.

**Dependencies:** Task 4

**Files likely touched:**
- `apps/web/src/views/HomePageContent.tsx`
- `apps/web/src/views/HomeSearchForm.tsx` (new)
- `apps/web/src/components/SearchBar.tsx`

**Estimated scope:** M

### Checkpoint: Home

- [ ] Tests + build
- [ ] PR notes First Load JS for `/` vs `main`
- [ ] PostHog: `search_submitted`, `home_rail_scrolled`, `home_view_all_clicked`, `deal_card_click`, `category_clicked`

### Phase 3: Deals results as RSC children

#### Task 6: Results slot on `DealsPageContent`

**Description:** `DealsPageContent` renders filter chrome and `{children}` for the listing. Remove `DealGrid` / `DealCard` imports. RSC pages (`/deals`, `/deals/c/…`, hub, brand, brand+category) pass `<DealGrid … listSurface={…} persistBackHref={dealsListPath} />` and empty state as children. Keep pagination, pending overlay, timeout alert in the client chrome wrapping the slot (grid still updates when the RSC children re-render after `router.replace`).

**Acceptance criteria:**
- [ ] `DealsPageContent` does not import `DealCard` or `DealGrid`.
- [ ] All five list page files pass the grid (or empty state) as children.
- [ ] Filter pending dimmer still covers the results.
- [ ] Back-from-PDP sessionStorage still set on View details / image link.

**Verification:** `/deals` filter, sort, pagination, mobile drawer; category and hub routes; production First Load JS for `/deals`.

**Dependencies:** Task 2

**Files likely touched:**
- `apps/web/src/views/DealsPageContent.tsx`
- `apps/web/src/app/(public)/deals/page.tsx`
- `apps/web/src/app/(public)/deals/c/[...slug]/page.tsx`
- `apps/web/src/app/(public)/deals/hub/[slug]/page.tsx`
- `apps/web/src/app/(public)/deals/brand/[slug]/page.tsx`
- `apps/web/src/app/(public)/deals/brand/[slug]/c/[...slugSegments]/page.tsx`

**Estimated scope:** L — if it grows, split “base `/deals`” then copy the slot to the other four routes.

#### Task 7: Docs + measure

**Description:** Record First Load JS. Update `apps/web/README.md` (Home / deals SSR note: page shells vs client chrome). Mention in `docs/ARCHITECTURE.md` Web bullet if that section still says the deals UI is a single client view.

**Acceptance criteria:**
- [ ] README describes Home as RSC + search/carousel islands; deals as filter chrome + RSC cards.
- [ ] Implementation PR includes before/after JS like #328.

**Dependencies:** Tasks 5–6

**Files likely touched:**
- `apps/web/README.md`
- `docs/ARCHITECTURE.md` (short)

**Estimated scope:** S

### Checkpoint: Complete

- [ ] All success criteria
- [ ] `tsc`, lint, vitest, `next build`
- [ ] Ready for review (Home + `/deals` + one category URL)

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client parent still imports `DealCard` | Cards stay in the JS bundle; “RSC” is a lie | Grep `from "./DealCard"` / `@/components/DealCard` from `"use client"` files; carousel and deals view must not import it |
| `Button` / radix `Slot` in RSC | Build error | Use `Button` only inside tracked client leaves |
| Hydration mismatch on money / dates | Broken cards | Card math stays deterministic; no `Date.now()` in card render |
| sessionStorage in RSC module | Server crash | Only in `TrackedLink` (`persistBackHref`) |
| Filter pending overlay vs RSC children | Overlay doesn’t cover grid | Chrome wraps `{children}` with the same `relative` / `aria-busy` div as today |
| Storybook children API | Broken carousel story | Update story to compose cards as children |
| Scope creep into pagination Links | Mixes ZAC-218 | Explicitly out of v1 |

## Parallelization

- Tasks 2 and 3 can proceed in parallel after Task 1.
- Task 4 (carousel) should wait for Task 2–3 so Home can pass RSC children.
- Task 6 can start after Task 2 even before Home is done; do not land deals-page import removal until `DealGrid` no longer needs a client `DealCard`.

## Not doing (v1)

- **`next/dynamic` on rails or cards** — wrong tool; hurts SEO / LCP.
- **Pagination `<Link>`** — ZAC-218; separate PR.
- **Lazy `FilterDrawer`** — small `vaul` win; separate from island split.
- **`NavHeader` / mega menu** — layout, not Home/`/deals` page JS.
- **`DealDetailContent` RSC split** — follow-up; chart already lazy.
- **Renaming PostHog events.**

## Suggested PR sequence

1. **feat(web): tracked link leaves + RSC DealCard** (Tasks 1–3) — safe if carousel still imports the card; hydration of cards may not drop yet.
2. **feat(web): Home RSC shell** (Tasks 4–5) — First Load JS for `/`.
3. **feat(web): deals list RSC results slot** (Task 6–7) — First Load JS for `/deals`.

One PR is acceptable if it stays reviewable; three PRs fail-faster.

## Assumptions

1. Visual design stays Workshop Modern; this is a boundary change, not a layout change.
2. Event contracts stay as documented in `apps/web/README.md` (PostHog section).
3. `listSurface` is passed from the route that already knows it (Home = `"home"`; list pages use `dealsListSurfaceFromListHref` / path).
4. We measure with `next build` Route / First Load JS, same as #328 — not Lighthouse as the merge gate (CI Lighthouse is SEO-only).
5. Giveaways **page** (`GiveawaysPageContent`) is out of scope; Home strip cards are in scope because they sit on `/`.
