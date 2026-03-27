---
name: DealCard Link refactor
overview: Convert DealCard from onClick+router.push to a Next.js Link wrapper, so clicking a deal navigates immediately (showing the deal detail skeleton), is SEO-crawlable, and gains prefetch-on-hover.
todos:
  - id: dealcard-link
    content: Refactor DealCard to accept href prop and wrap in next/link instead of using onClick+onSelect
    status: pending
  - id: dealgrid-href
    content: Change DealGrid from onSelectDeal callback to getHref function prop
    status: pending
  - id: deals-cleanup
    content: Remove nav useTransition and useRouter from DealsPageContent, pass getHref to DealGrid
    status: pending
  - id: home-cleanup
    content: Remove deal-card startTransition from HomePageContent, pass getHref to DealGrid
    status: pending
  - id: stories-update
    content: Update DealCard.stories.tsx to use href instead of onSelect
    status: pending
  - id: docs-link-convention
    content: Add "Prefer Link over router.push" convention to component-library.mdc and apps/web/README.md
    status: pending
isProject: false
---

# Convert DealCard to use Link for instant navigation and SEO

## Problem

DealCard currently uses `onClick` + `onSelect` callback + `router.push` wrapped in `startTransition`. This causes:

- The **deals page** dims (pending overlay) while the deal detail RSC loads, instead of instantly showing the deal detail skeleton
- No `<a>` tag in the HTML -- search engines cannot crawl deal links
- No browser link affordances (right-click "open in new tab", cmd+click)
- No Next.js prefetch-on-hover

## Solution

Wrap the entire `DealCard` in a Next.js `<Link href="/deals/{id}">` so clicking navigates immediately, showing the deal detail `loading.tsx` skeleton. The "Snag the Deal" button (external link to retailer) uses `e.stopPropagation()` + `e.preventDefault()` on the outer Link to still open externally.

## Changes

### 1. `DealCard.tsx` -- replace `onSelect` callback with `href` prop

Replace the `onSelect` callback pattern with a direct `href` string prop. Wrap the `Card` in `<Link>`:

```tsx
import Link from "next/link";

type DealCardProps = {
  deal: Deal;
  href?: string; // replaces onSelect
};
```

- Remove `onClick`, `role="button"`, `tabIndex`, `onKeyDown` from `Card`
- Wrap `Card` in `<Link href={href} className="block">` when `href` is provided; plain `Card` when not
- Keep the "Snag the Deal" `<a>` button with `e.preventDefault()` on the wrapping Link click (currently uses `e.stopPropagation()` which will still work -- clicks on the inner `<a>` won't follow the outer Link)
- Move the `track("deal_card_click")` into an `onClick` on the Link itself

### 2. `DealGrid.tsx` -- replace `onSelectDeal` with `getHref`

Change the prop from `onSelectDeal?: (deal: Deal) => void` to `getHref?: (deal: Deal) => string`:

```tsx
type DealGridProps = {
  deals: Deal[];
  getHref?: (deal: Deal) => string;
};
```

Pass `href={getHref?.(deal)}` to each `DealCard`.

### 3. `DealsPageContent.tsx` -- remove `startNavTransition`, pass `getHref`

- Remove `useTransition` for navigation (keep the filter `isPending` from `useFilterParams`)
- Remove `useRouter` entirely (no longer needed -- filters use `useFilterParams`, deal nav uses Link)
- Change `resultsPending` to just `isFilterPending`
- Pass `getHref={(d) =>` /deals/${d.id}`}` to `DealGrid`

### 4. `HomePageContent.tsx` -- pass `getHref` instead of `onSelectDeal`

- Remove the `startTransition` wrapper around `router.push` for deal cards
- Pass `getHref={(deal) =>` /deals/${deal.id}`}` to `DealGrid`
- Keep `useTransition` for the search form submit (that still uses `router.push`)

### 5. `DealCard.stories.tsx` -- update props

Replace `onSelect` action with `href` string in story args.

### 6. Docs -- add "Prefer Link" convention

**Audit result:** All other navigable elements already use `<Link>`. `CategoryCard` wraps in `<Link>` (confirmed). The only remaining `router.push` is the search form submit in `HomePageContent`, which is correct -- form submissions are not links.

Add a convention to [.cursor/rules/component-library.mdc](.cursor/rules/component-library.mdc) under "Use Primitives First":

```
- **Navigation** → Use `Link` from `next/link` for any clickable element that navigates to an internal route (not `router.push` + `onClick`). This gives SEO-crawlable `<a>` tags, prefetch-on-hover, and instant `loading.tsx` skeletons. Reserve `router.push` only for programmatic navigation (e.g. form submissions, redirects after async actions).
```

Add a short note to [apps/web/README.md](apps/web/README.md) in the Features section:

```
- **SEO** — All internal navigation uses `<Link>` from `next/link` (crawlable `<a>` tags, prefetch-on-hover). `router.push` is reserved for programmatic actions (form submits, redirects).
```

## Files to change

- [apps/web/src/components/DealCard.tsx](apps/web/src/components/DealCard.tsx) -- wrap in Link, replace `onSelect` with `href`
- [apps/web/src/components/DealGrid.tsx](apps/web/src/components/DealGrid.tsx) -- replace `onSelectDeal` with `getHref`
- [apps/web/src/views/DealsPageContent.tsx](apps/web/src/views/DealsPageContent.tsx) -- remove nav transition, pass `getHref`
- [apps/web/src/views/HomePageContent.tsx](apps/web/src/views/HomePageContent.tsx) -- pass `getHref`
- [apps/web/src/components/DealCard.stories.tsx](apps/web/src/components/DealCard.stories.tsx) -- update story args
- [.cursor/rules/component-library.mdc](.cursor/rules/component-library.mdc) -- add "Prefer Link" convention
- [apps/web/README.md](apps/web/README.md) -- add SEO/Link note
