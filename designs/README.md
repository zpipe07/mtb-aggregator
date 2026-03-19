# Pencil design — public UI

High-fidelity layout reference for the user-facing app (Home, Deals, Deal detail) in [Pencil](https://pencil.dev), aligned with `apps/web/src/app/globals.css` semantic tokens.

## Saving the `.pen` file

The working document is opened in Pencil as **`pencil-new.pen`**. To keep it in this repo, use **File → Save As** in Pencil and save as:

`designs/mtb-public-ui.pen`

(A commit-friendly copy cannot be written here automatically; the editor owns the file.)

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
| `$primary` | `--primary` |
| `$primaryForeground` | `--primary-foreground` |
| `$destructive` | `--destructive` |
| `$radius` | `--radius` (~10px) |

**Theme axis:** `mode` → `light` | `dark`. Set `theme: { "mode": "dark" }` on a screen frame so variables resolve to the dark column.

## Exported previews

PNG exports of each screen (for reviews / Figma handoff) live in **`pencil-exports/`** (regenerate from Pencil via MCP `export_nodes` or the app if layouts change).
