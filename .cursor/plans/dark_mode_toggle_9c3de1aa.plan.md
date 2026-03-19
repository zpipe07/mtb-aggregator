---
name: Dark Mode Toggle
overview: Add a dark mode toggle to the app by creating a theme provider that applies the `dark` class to the document root, persisting preference in localStorage, and placing a sun/moon toggle in the nav header. The dark mode CSS is already defined; we need the runtime wiring and UI.
todos: []
isProject: false
---

# Dark Mode Toggle Implementation

## Current State

- **Dark mode CSS is ready**: [apps/web/src/index.css](apps/web/src/index.css) defines `.dark` with full design tokens (lines 99-130) and `@custom-variant dark (&:is(.dark *))` (line 8) for Tailwind v4
- **Storybook** already toggles themes by adding `className="dark"` to a wrapper div ([.storybook/preview.tsx](apps/web/.storybook/preview.tsx) line 42)
- **Public pages** use semantic tokens (`bg-background`, `text-foreground`, etc.) and will respond to dark mode
- **One fix needed**: [PublicLayout](apps/web/src/components/PublicLayout.tsx) uses `bg-stone-100` (line 6) — should be `bg-background` for dark mode

## Implementation

### 1. Theme hook and provider

Create `apps/web/src/hooks/useTheme.ts` (or `context/ThemeContext.tsx`):

- State: `"light" | "dark"`
- On mount: read from `localStorage.getItem("theme")` or fall back to `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`
- Effect: when theme changes, set `document.documentElement.classList.toggle("dark", theme === "dark")` and `localStorage.setItem("theme", theme)`
- Export `useTheme()` returning `{ theme, setTheme, toggleTheme }`

### 2. Toggle UI in NavHeader

Add a button to [NavHeader](apps/web/src/components/NavHeader.tsx) (e.g., next to nav links on desktop, in mobile menu on mobile):

- Sun icon when `theme === "dark"` (click to switch to light)
- Moon icon when `theme === "light"` (click to switch to dark)
- Use `Button` with `variant="ghost"` and `size="icon"` for consistency
- Icons: inline SVG (matching existing pattern) or `lucide-react` (already in deps)

### 3. Wire theme provider

Wrap the app in [main.tsx](apps/web/src/main.tsx) with a `ThemeProvider` that:

- Runs the effect to apply `dark` class on mount and when theme changes
- Provides theme state via React context so `NavHeader` can read/set it

### 4. Fix PublicLayout

In [PublicLayout](apps/web/src/components/PublicLayout.tsx), change `bg-stone-100` to `bg-background` so the main content area respects dark mode.

## Optional enhancements (out of scope unless requested)

- **"System" option**: Third option that follows `prefers-color-scheme` and updates when OS preference changes
- **Admin section**: Admin pages use many hardcoded `stone-` colors (StoreManager, TaxonomyManager, etc.). Full dark mode there would require migrating those to semantic tokens (`bg-card`, `text-foreground`, etc.)

## File changes summary

| File                              | Change                                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| `src/hooks/useTheme.ts` (new)     | Theme state, localStorage persistence, `document.documentElement.classList` |
| `src/components/NavHeader.tsx`    | Add theme toggle button with sun/moon icons                                 |
| `src/main.tsx`                    | Wrap app in ThemeProvider                                                   |
| `src/components/PublicLayout.tsx` | `bg-stone-100` → `bg-background`                                            |
