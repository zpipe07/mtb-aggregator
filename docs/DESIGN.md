# Design Guide

Visual identity and language guidelines for the MTB Deal Aggregator. Use this when building UI, writing copy, or iterating on the design system.

> **Workshop Modern (Direction C)** is **rolled out in production** for the public app (light theme). Spec: [DESIGN_REDESIGN.md](DESIGN_REDESIGN.md). Storybook prototype: `WorkshopModernPreview`. Pencil reference: [`designs/mtb-public-ui-v3.pen`](../designs/mtb-public-ui-v3.pen). Legacy “Trail + hazard orange” notes below are kept as history where useful.

---

## 2. Visual Identity & "The Vibe"

**Think "High-Tech Workshop meets Deep Woods."**

| Element | Direction |
| :--- | :--- |
| **Color Palette** | **Concrete & lime** — cool stone canvas (`--background`), near-black ink (`--foreground`), paper cards (`--card`), **electric lime** (`--primary`) for CTAs and focus, warm grey rules (`--border`). Store/retailer chips use a deep sienna **`--trail`** (distinct from the old teal trail). |
| **Typography** | **Geist Variable** for UI and display (h1–h3 use the display stack in `globals.css`). **Geist Mono Variable** for labels, chips, and “workshop” mono touches (`--font-mono` in `@theme`). |
| **Imagery** | High-contrast, "action" photography. Avoid stock photos of smiling people on bikes. Use close-ups of gritty components: a muddy derailleur, a clean carbon weave, or a tire biting into loam. |
| **The Vibe** | **"Dialed-in."** The site shouldn't feel like a mall; it should feel like a specialized tool. |

**Logo:** Primary mark is [`apps/web/public/logo.png`](../apps/web/public/logo.png) (vertical icon). [`logo-light.png`](../apps/web/public/logo-light.png) is the same mark tuned for dark backgrounds—used in the public nav when dark mode is active. **Favicon:** [`favicon.png`](../apps/web/public/favicon.png) when the OS/browser prefers light chrome, [`favicon-light.png`](../apps/web/public/favicon-light.png) when it prefers dark (`metadata.icons` in `layout.tsx`). Admin chrome uses `logo.png`. Additional wordmark assets may live in `public/` for one-off use (e.g. exports).

---

## 3. Language & Tone (The Copy)

Speak the language of the trailhead. Avoid generic "Save money!" fluff.

### Headlines

- "Dialed-in deals."
- "Stop searching, start shredding."
- "Top-tier specs, entry-level prices."

### Micro-copy

| Avoid | Use instead |
| :--- | :--- |
| Buy Now | Snag the Deal |
| View Product | View Specs |
| Email Newsletter | The Friday Drop |

### Transparency

Since it's an aggregator, be honest:

- "We scanned 50+ shops so you didn't have to."

---

## Implementation Notes

- **Colors**: Mapped in `apps/web/src/app/globals.css` (`:root`, `.dark`). **Light (production):** Workshop Modern OKLCH tokens on `:root`. **`html` does not use the `dark` class** (see `layout.tsx` + `ThemeProvider`); you should always see stone canvas + lime CTAs. The `.dark` block keeps lime-aligned primary/ring as a fallback if `.dark` is ever present.
- **Typography**: `--app-font-sans` / `--app-font-display` (**Geist Variable**), `--app-font-mono` (**Geist Mono Variable**). Loaded via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` in `globals.css`.
- **Components**: Primary actions use **lime** (`--primary`) with workshop patterns (open-frame search, stamp checkboxes, etc.) per [DESIGN_REDESIGN.md](DESIGN_REDESIGN.md). See [docs/ARCHITECTURE.md](ARCHITECTURE.md#component-library) for the component system.
- **Storybook**: Run `pnpm --filter @mtb-aggregator/web run storybook` and open **Design / Design Tokens** to view the palette and typography.
- **Pencil (layout reference)**: High-fidelity frames for Home, Deals, and Deal detail (light + dark) live in the Pencil editor document; semantic colors are mirrored as file variables from `apps/web/src/app/globals.css`. See [designs/README.md](../designs/README.md) for the variable map and exported PNG previews.
