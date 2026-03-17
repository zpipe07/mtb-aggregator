---
name: Implement Design Guide
overview: "Apply the visual identity and copy guidelines from docs/DESIGN.md to the web app: update the color palette (Carbon Grey, Mud/Deep Forest, Hazard Orange), typography (bold condensed headers), CTA styling, and all user-facing copy."
todos: []
isProject: false
---

# Implement Design Guide

Apply [docs/DESIGN.md](docs/DESIGN.md) to the web app across colors, typography, CTAs, and copy.

---

## 1. Color Palette

**File:** [apps/web/src/index.css](apps/web/src/index.css)

Map the design tokens to CSS variables:

| Token                     | Light mode                                   | Dark mode      |
| ------------------------- | -------------------------------------------- | -------------- |
| Carbon Grey (#2D2D2D)     | `--foreground`, `--primary` (text/surfaces)  | base           |
| Mud/Deep Forest (#1B3022) | `--background` or accent surfaces            | `--background` |
| Hazard Orange (#FF5E00)   | `--primary` for CTAs (or new `--accent-cta`) | same           |

**Approach:** Use `--primary` for Hazard Orange on CTA buttons, and introduce `--color-carbon` / `--color-forest` as named tokens. Map `--background` to Mud/Deep Forest (or a light tint for light mode). Convert hex to oklch for consistency with existing theme.

**Light mode:** Keep a light background for readability; use Carbon Grey for text, Mud/Deep Forest as a subtle accent (e.g., header bar, borders). Hazard Orange for primary/CTA.

**Dark mode:** Mud/Deep Forest as background, Carbon Grey for text, Hazard Orange for CTAs.

---

## 2. Typography

**Files:** [apps/web/src/index.css](apps/web/src/index.css), [apps/web/package.json](apps/web/package.json)

- Add **Oswald** or **Inter** for display/headers (design guide: "bold, condensed Sans-Serif").
- Add `@fontsource/oswald` or `@fontsource/inter` (variable) to `package.json`.
- Define `--font-display` in `@theme` and apply to `h1`, `h2`, `h3` via a utility or base layer.
- Keep Geist for body text, or switch body to Inter if a single font family is preferred.

---

## 3. CTA Button Styling

**File:** [apps/web/src/components/ui/button.tsx](apps/web/src/components/ui/button.tsx)

- Ensure the `default` variant uses Hazard Orange (`--primary`).
- Add hover/active states that keep the orange but darken slightly.
- Verify [DealCard](apps/web/src/components/DealCard.tsx), [DealDetailModal](apps/web/src/components/DealDetailModal.tsx), [FilterDrawer](apps/web/src/components/FilterDrawer.tsx), and [HomePage](apps/web/src/pages/HomePage.tsx) use the primary Button for CTAs.

---

## 4. Copy Updates

| Location                                                       | Current                                                  | New (per design guide)                        |
| -------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| [HomePage](apps/web/src/pages/HomePage.tsx)                    | "MTB Deal Aggregator"                                    | "Dialed-in deals." (or keep brand + tagline)  |
| HomePage                                                       | "Find the best mountain bike deals across top retailers" | "We scanned 50+ shops so you didn't have to." |
| HomePage                                                       | "Search" (button)                                        | Keep or "Search deals"                        |
| HomePage                                                       | "Top deals of the day"                                   | "Dialed-in deals" or "Top deals"              |
| HomePage                                                       | "View all deals"                                         | Keep                                          |
| [DealCard](apps/web/src/components/DealCard.tsx)               | "View Deal"                                              | "Snag the Deal"                               |
| [DealDetailModal](apps/web/src/components/DealDetailModal.tsx) | "View at store"                                          | "Snag the Deal"                               |
| [SearchBar](apps/web/src/components/SearchBar.tsx)             | "Search deals…" placeholder                              | Keep (already aligned)                        |

**Note:** "The Friday Drop" applies to a newsletter signup; add only if that feature exists. For now, skip.

---

## 5. Semantic Token Migration

**Files:** HomePage, DealsPage, NavHeader, FilterDrawer, FilterSidebar, DealDetailModal, etc.

Replace raw `text-stone-`_, `bg-stone-`_, `border-stone-\` with semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `border-border`) so components inherit the new palette. This aligns with [.cursor/rules/component-library.mdc](.cursor/rules/component-library.mdc).

---

## 6. Imagery (Deferred)

Design guide: "High-contrast action photography… muddy derailleur, carbon weave, tire biting loam." The app currently has no hero imagery; product images come from the API. Options:

- Add a hero background image on HomePage (requires asset).
- Document in DESIGN.md that hero/background imagery should follow these guidelines when added.

**Recommendation:** Defer hero imagery to a follow-up. Document the imagery guidelines; implement when assets are available.

---

## 7. Storybook and Docs

- Update [DealCard.stories.tsx](apps/web/src/components/DealCard.stories.tsx) if copy changes.
- Add a "Design tokens" story or doc in Storybook showing the palette (Carbon Grey, Mud/Deep Forest, Hazard Orange).
- Update [docs/DESIGN.md](docs/DESIGN.md) Implementation Notes with actual variable names after implementation.

---

## Implementation Order

1. **Colors** — Update `index.css` variables; verify light/dark both look correct.
2. **Typography** — Add font, wire `--font-display`, apply to headings.
3. **Copy** — Update all strings in one pass.
4. **Semantic tokens** — Replace stone- with theme tokens across components.
5. **Storybook** — Add palette doc, verify stories render correctly.

---

## Out of Scope

- Newsletter / "The Friday Drop" (no feature yet)
- Hero imagery (deferred)
- Admin UI (keep functional; optional light styling pass later)
