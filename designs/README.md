# Pencil design — public UI

High-fidelity layout reference for the user-facing app (Home, Deals, Deal detail) in [Pencil](https://pencil.dev). **Canonical colors live in the web app** (`apps/web/src/app/globals.css` as `oklch(...)`). The `.pen` file mirrors them only indirectly.

## Saving the `.pen` file

The working document is opened in Pencil as **`pencil-new.pen`**. To keep it in this repo, use **File → Save As** in Pencil and save as:

`designs/mtb-public-ui.pen`

(A commit-friendly copy cannot be written here automatically; the editor owns the file.)

## Why Pencil and the browser can look different

1. **Different formats** — The app uses **OKLCH** in CSS. Pencil variables are **8-digit or 6-digit hex** entered by hand to approximate those tokens. OKLCH→sRGB is not a simple “eyeball” match; small errors stack, and hue/lightness can read differently next to other colors.

2. **No shared pipeline** — Nothing auto-syncs `globals.css` into the `.pen` file. When tokens change in code, Pencil hex values are easy to leave slightly off unless someone updates them (or converts with a color tool).

3. **Rendering & blending** — The browser applies **opacity** (`bg-trail/92`), **shadows**, **focus rings**, **images**, and **color-mix** (e.g. outline). Pencil mostly uses **flat fills** from variables, so the same semantic token won’t look identical in every component.

4. **Display / canvas** — The browser tab and Pencil’s canvas can differ slightly depending on **display profile** and how each app maps colors to the screen.

**Ground truth:** Inspect the app (e.g. DevTools → Computed → `background-color` on `body` or a card) and compare to Pencil’s variable hex if you need a pixel match. To align Pencil: convert each `oklch()` from `globals.css` to sRGB hex with a dedicated converter (e.g. [oklch.com](https://oklch.com)) and paste into Pencil’s theme variables.

## On-canvas frames (left → right)

| Frame | Theme | Notes |
| :--- | :--- | :--- |
| Home · Light | `mode: light` | Hero, search, 8 category cards, 3 top deal cards |
| Home · Dark | `mode: dark` | Copy of home; theme toggle icon = sun |
| Deals · Light | `mode: light` | Header, filters sidebar, toolbar, chips, pagination, 2-column deal grid |
| Deals · Dark | `mode: dark` | Same structure; sun icon |
| Deal detail · Light | `mode: light` | Header, back link, card + price history placeholder |
| Deal detail · Dark | `mode: dark` | Detail pills use dark-mode red/green tints (matches `DealDetailContent` Tailwind dark variants) |

A **note** node below the artboards documents token mapping inside the Pencil file.

## Pencil variables ↔ `globals.css`

Colors in Pencil use **hex approximations** of the oklch values in `:root` / `.dark`. Bindings use `$variableName` on fills, strokes, and corner radius.

| Pencil variable | CSS role |
| :--- | :--- |
| `$background` | `--background` |
| `$foreground` | `--foreground` |
| `$card` | `--card` |
| `$muted` | `--muted` |
| `$mutedForeground` | `--muted-foreground` |
| `$border` | `--border` |
| `$secondary` | `--secondary` (subtle grey band) |
| `$secondaryForeground` | `--secondary-foreground` |
| `$accent` | `--accent` (cool blue-grey wash) |
| `$accentForeground` | `--accent-foreground` |
| `$trail` | `--trail` (teal pop) |
| `$trailForeground` | `--trail-foreground` |
| `$primary` | `--primary` |
| `$primaryForeground` | `--primary-foreground` |
| `$destructive` | `--destructive` |
| `$radius` | `--radius` (~10px) |

**Theme axis:** `mode` → `light` | `dark`. Set `theme: { "mode": "dark" }` on a screen frame so variables resolve to the dark column.

**Typography (app):** [Plus Jakarta Sans](https://fontsource.org/fonts/plus-jakarta-sans) (body/UI) and [Bricolage Grotesque](https://fontsource.org/fonts/bricolage-grotesque) (h1–h3) via `@fontsource-variable` in `apps/web/src/app/globals.css`. Pencil text nodes use the same family names where the editor has them available.

## Exported previews

PNG exports of each screen (for reviews / Figma handoff) live in **`pencil-exports/`** (regenerate from Pencil via MCP `export_nodes` or the app if layouts change).
