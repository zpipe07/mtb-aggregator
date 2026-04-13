---
name: UI consistency and polish
overview: Replace raw HTML elements with reusable UI primitives across the public-facing app (scoping admin to a separate pass), fix the Select text overflow bug, improve input border contrast, and add targeted visual polish to differentiate the UI.
todos:
  - id: select-consistency
    content: Replace raw <select> and <button> in DealFilters.tsx with Select and Button components
    status: completed
  - id: fix-select-overflow
    content: Change h-9 to min-h-9 on Select and Input to fix text overflow on small screens
    status: completed
  - id: input-border-contrast
    content: Adjust --input token in globals.css for better border contrast in both light and dark modes
    status: completed
  - id: dealcard-badge
    content: Upgrade discount badge on DealCard to use primary orange + font-mono
    status: completed
  - id: category-hover
    content: Add primary-tinted ring on CategoryCard hover
    status: completed
  - id: search-icon
    content: Add leading search icon to SearchBar input
    status: completed
  - id: review-polish
    content: Review all changes together, check lints, verify consistency
    status: completed
isProject: false
---

# UI Consistency, Contrast, and Polish

## Scope

Focus on **public-facing components** first (everything in `apps/web/src/components/` and `apps/web/src/views/`). The admin section has ~115 raw `<button>`, ~35 raw `<input>`, ~13 raw `<select>`, and ~10 raw `<table>` elements -- those will be a separate follow-up since they are internal tooling and don't affect the user-facing product.

---

## 1. Replace raw HTML `<select>` with `<Select />` in public components

**One confirmed violation** in the public UI:

- [apps/web/src/components/DealFilters.tsx](apps/web/src/components/DealFilters.tsx) lines 166-177 -- raw `<select>` for spec facet filters

The fix: import `Select` from `@/components/ui/select` (already used by `FilterSidebar.tsx` for the same purpose) and swap the raw element. The raw `<button>` on line 179 ("Clear") should also become a `Button variant="link"`, matching the pattern already used in `FilterSidebar.tsx` line 139.

The raw `<button>` on line 111 ("Clear all") is another candidate.

---

## 2. Fix Select text overflow on small screens

The bug: `Select` uses `h-9` (36px fixed height) + `text-base` on mobile (`md:text-sm` on desktop). On small screens, the larger `text-base` (16px) combined with the fixed 36px height and `py-2` (8px top + 8px bottom = 16px padding) leaves only 20px for line-height, causing visual clipping.

**Recommended fix:** Remove the explicit `h-9` from both `Select` and `Input`, and let padding + line-height determine the height naturally. This is the approach you prefer, and it works because:

- `px-3 py-2` provides consistent internal spacing
- The text size (`text-base` / `md:text-sm`) plus padding will produce a natural height that fits the content
- `min-h-9` can be added as a floor to prevent the element from collapsing when empty, without constraining growth

Concretely in [apps/web/src/components/ui/select.tsx](apps/web/src/components/ui/select.tsx) and [apps/web/src/components/ui/input.tsx](apps/web/src/components/ui/input.tsx):

- Change `h-9` to `min-h-9`

The same change should be applied to `Input` for consistency since they share the same class pattern. The `Button` component already works fine since CVA controls its sizing per-variant.

---

## 3. Improve input/select border contrast

**The problem:** The `--input` token (used as `border-input` on controls) is too close to the background:

| Mode  | `--input` (border) | `--background`     | `--card`           |
| ----- | ------------------ | ------------------ | ------------------ |
| Light | `oklch(0.86 ...)`  | `oklch(0.935 ...)` | `oklch(0.995 ...)` |
| Dark  | `oklch(0.44 ...)`  | `oklch(0.34 ...)`  | `oklch(0.46 ...)`  |

Light mode: inputs on a card (`0.995`) have a border (`0.86`) with only ~0.135 L difference -- low contrast. Dark mode: inputs on background (`0.34`) have border (`0.44`) with only ~0.10 L difference.

**Recommended fix:** Adjust `--input` in [apps/web/src/app/globals.css](apps/web/src/app/globals.css) to use a darker/lighter value that increases contrast against both `--background` and `--card`:

- **Light:** Change `--input` from `oklch(0.86 0.020 95)` to approximately `oklch(0.74 0.022 95)` -- this gives a clear visible border on both the grey canvas and white cards, without being as heavy as `--border` (`0.62`).
- **Dark:** Change `--input` from `oklch(0.44 0.024 155)` to approximately `oklch(0.58 0.028 155)` -- lighter than the card surface (`0.46`), providing visible contrast.

This single token change updates `Input`, `Select`, outline `Button`, and all other controls using `border-input` globally -- no per-component edits needed.

---

## 4. Visual polish to differentiate the UI

Several targeted, low-effort changes that push the UI beyond "basic shadcn" toward the "dialed-in" identity from [docs/DESIGN.md](docs/DESIGN.md):

### 4a. Discount badge upgrade on DealCard

Currently the "X% off" badge in [DealCard.tsx](apps/web/src/components/DealCard.tsx) line 78 is a plain `<span>` with `bg-destructive`. Replace with the primary orange (`bg-primary text-primary-foreground`) and add a subtle `font-mono` treatment for the number to give it a "spec sheet" feel -- aligning with the "high-tech workshop" vibe.

### 4b. Category card hover micro-interaction

[CategoryCard.tsx](apps/web/src/components/CategoryCard.tsx) already has `group-hover:scale-105` on images. Add a subtle border-left accent on hover:

```
ring-1 ring-foreground/10 hover:ring-primary/40 transition-all
```

This gives the card a warm orange "glow" on hover, reinforcing the brand color without being heavy.

### 4c. Toolbar search input icon

The search bar in [SearchBar.tsx](apps/web/src/components/SearchBar.tsx) is a plain `Input`. Wrapping it in a container with a leading search icon (magnifying glass SVG positioned absolutely) adds an immediately recognizable affordance and visual interest. This is a common pattern that makes the toolbar feel more polished.

### 4d. Section dividers with texture

The deals page uses `border-t border-border` for section dividers. A subtle gradient divider or a slightly thicker `border-t-2 border-border/50` can add just enough differentiation to feel intentional rather than default.

### 4e. Active filter chip styling

Filter chips / active filter indicators could use the `--trail` token (muted teal) as a background accent, tying into the brand's outdoor color palette rather than using generic muted grey.

---

## 5. Typography -- shadcn typography components?

shadcn/ui does not ship a dedicated "Typography" component set. The approach already in use -- Tailwind utility classes + the `--font-display` / `--font-sans` CSS variables applied in `globals.css` -- is the standard pattern. The `h1, h2, h3 { font-family: var(--font-display) }` rule in globals already handles display typography globally. No additional typography components are needed; the current approach is correct.

---

## Out of scope (follow-up)

- **Admin section refactor**: 115 raw buttons, 35 raw inputs, 13 raw selects, 10 raw tables -- these are all internal tooling and warrant a separate dedicated pass.
- Adding a shadcn `Separator` component (no `<hr>` elements exist in the codebase today).
