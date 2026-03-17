---
name: Storybook and UI Components
overview: Introduce Storybook for component development and add shadcn/ui as a design-system foundation. This enables visual consistency, rapid iteration on designs and color palettes via CSS variables, and a documented component library.
todos: []
isProject: false
---

# Storybook and Reusable UI Components

## Current State

- **Web app**: React 18, Vite, Tailwind 3.4
- **Components**: ~20 components in `[apps/web/src/components/](apps/web/src/components/)` and `admin/` — no shared primitives (Button, Input, Card)
- **Styling**: Ad-hoc Tailwind classes (`stone-`, `rounded-lg`, etc.) repeated across components; no design tokens or theme layer
- **No Storybook** or component documentation

## Recommended Approach: shadcn/ui + Storybook

**Why shadcn:**

- Copy-paste model: components live in your repo — full ownership and customization
- Built on Radix UI primitives (accessibility, keyboard nav, focus management)
- Uses CSS variables for theming — ideal for quick palette iteration
- Tailwind-native; aligns with your existing stack
- You add only the components you need (Button, Input, Card, etc.)

**Why Storybook:**

- Isolated development and documentation for each component
- Visual regression and interaction testing
- Theme addon or custom theme switcher for palette iteration
- Your existing [storybook-story-writing skill](.agents/skills/storybook-story-writing/SKILL.md) provides CSF3 patterns

---

## Phase 1: Foundation

### 1.1 Add Storybook to the web app

```bash
cd apps/web && pnpm dlx storybook@latest init
```

- Select **Vite** as builder, **React** as framework
- Storybook will add `@storybook/react-vite`, config in `.storybook/`, and a `storybook` script

**Required config updates:**

- Ensure Storybook's Vite config uses the same PostCSS/Tailwind setup as the app (or imports `vite.config.ts`)
- Add a decorator in `.storybook/preview.tsx` to import `[src/index.css](apps/web/src/index.css)` so Tailwind and global styles apply to stories

### 1.2 Initialize shadcn/ui

```bash
cd apps/web && pnpm dlx shadcn@latest init
```

**Choices:**

- Style: **New York**
- Base color: **Stone** (matches current `stone-` palette) or **Slate** — can change later
- CSS variables: **Yes**
- React Server Components: **No** (Vite)
- `components.json` will be created; components go in `src/components/ui/`

This will:

- Add `tailwind.config.ts` (or extend existing) with shadcn theme
- Add/update `src/index.css` with CSS variables (`--background`, `--foreground`, `--primary`, etc.)
- Add `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/` deps

### 1.3 Wire Storybook to shadcn theme

- Import the same `index.css` in Storybook preview so CSS variables apply
- Add a **theme switcher** (or use `@storybook/addon-themes`) to toggle light/dark or alternate palettes for quick iteration

---

## Phase 2: Primitives and First Stories

### 2.1 Add initial shadcn components

```bash
pnpm dlx shadcn@latest add button input card
```

These map to your current patterns:

- **Button** → inline buttons in HomePage, Pagination, NavHeader
- **Input** → SearchBar, FilterInput
- **Card** → DealCard, CategoryCard

### 2.2 Create Storybook stories for primitives

Per the [storybook-story-writing skill](.agents/skills/storybook-story-writing/SKILL.md), use CSF3 format:

- `src/components/ui/button.stories.tsx` — Primary, Secondary, Outline, Ghost, Disabled, Sizes
- `src/components/ui/input.stories.tsx` — Default, With placeholder, Disabled
- `src/components/ui/card.stories.tsx` — Default, With header/footer

### 2.3 Optional: Theme iteration addon

For quick palette iteration, add a custom theme control or use `@storybook/addon-themes` to switch between:

- Light / dark
- Custom palettes (e.g. different `--primary` values) defined as CSS variable overrides

---

## Phase 3: Migrate Existing Components (Incremental)

Refactor high-traffic components to use primitives:

| Component                                                    | Primitive(s) to use    |
| ------------------------------------------------------------ | ---------------------- |
| [HomePage.tsx](apps/web/src/pages/HomePage.tsx)              | Button (search submit) |
| [SearchBar.tsx](apps/web/src/components/SearchBar.tsx)       | Input                  |
| [FilterInput.tsx](apps/web/src/components/FilterInput.tsx)   | Input                  |
| [DealCard.tsx](apps/web/src/components/DealCard.tsx)         | Card, Button           |
| [CategoryCard.tsx](apps/web/src/components/CategoryCard.tsx) | Card                   |
| [Pagination.tsx](apps/web/src/components/Pagination.tsx)     | Button                 |

Add stories for composed components (DealCard, CategoryCard, Pagination) to document states and variants.

---

## File Structure (After Setup)

```
apps/web/
├── .storybook/
│   ├── main.ts
│   └── preview.tsx
├── src/
│   ├── components/
│   │   ├── ui/           # shadcn primitives
│   │   │   ├── button.tsx
│   │   │   ├── button.stories.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   └── ...
│   │   ├── DealCard.tsx
│   │   ├── CategoryCard.tsx
│   │   └── ...
│   └── index.css         # Tailwind + CSS variables
├── components.json       # shadcn config
└── tailwind.config.ts    # extended by shadcn
```

---

## Quick Iteration on Color Palettes

shadcn uses CSS variables in `:root`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 20 14.3% 4.1%;
  --primary: 24 9.8% 10%;
  --primary-foreground: 60 9.1% 97.8%;
  /* ... */
}
```

To iterate:

1. Edit these values in `index.css` (or a separate `tokens.css`)
2. Use Storybook's theme addon to preview light/dark
3. Optionally add a "palette" control that injects different `--primary` / `--accent` values for A/B testing

---

## Alternatives Considered

| Approach                                 | Pros                                       | Cons                                                      |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **Custom primitives only**               | Full control, no new deps                  | More work; you rebuild Button, Input, Card, accessibility |
| **Full component library (MUI, Chakra)** | Many components                            | Heavier, opinionated, harder to theme to your brand       |
| **shadcn (chosen)**                      | Copy-paste, Radix a11y, Tailwind, CSS vars | Small learning curve; need to add components as you go    |

---

## Documentation Updates

Per [documentation-sync](.cursor/rules/documentation-sync.mdc):

- Add a "Component library" section to [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [README.md](README.md) describing Storybook, `src/components/ui/`, and how to add new primitives
- Add `pnpm --filter @mtb-aggregator/web run storybook` to [CLAUDE.md](CLAUDE.md) Commands section
