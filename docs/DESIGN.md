# Design Guide

Visual identity and language guidelines for the MTB Deal Aggregator. Use this when building UI, writing copy, or iterating on the design system.

> **Workshop Modern (Direction C)** is **rolled out in production** for the public app (light theme). Spec: [DESIGN_REDESIGN.md](DESIGN_REDESIGN.md). Storybook prototype: `WorkshopModernPreview`. Pencil reference: [`designs/mtb-public-ui-v3.pen`](../designs/mtb-public-ui-v3.pen). Legacy “Trail + hazard orange” notes below are kept as history where useful.

---

## 2. Visual Identity & "The Vibe"

**Think "High-Tech Workshop meets Deep Woods."**

| Element | Direction |
| :--- | :--- |
| **Color Palette** | **Concrete & lime** — cool stone canvas (`--background`), near-black ink (`--foreground`), paper cards (`--card`), **electric lime** (`--primary`) for CTAs and focus, warm grey rules (`--border`). **`--trail`** / **`--accent`** use a cool graphite for secondary emphasis (Workshop Modern story parity; retailer callouts in cards use mono `//` labels, not a colored pill). |
| **Typography** | **Geist Variable** for UI and display (h1–h3 use the display stack in `globals.css`). **Geist Mono Variable** for labels, chips, and “workshop” mono touches (`--font-mono` in `@theme`). Section labels use numbered mono eyebrows (`// 01`, `// 02`) beside display headings on **home** and **categories**—not the `§` ornament from the Storybook-only `SectionDivider` demo. |
| **Imagery** | High-contrast, "action" photography. Avoid stock photos of smiling people on bikes. Use close-ups of gritty components: a muddy derailleur, a clean carbon weave, or a tire biting into loam. |
| **The Vibe** | **"Dialed-in."** The site shouldn't feel like a mall; it should feel like a specialized tool. |

**Logo:** Primary mark is the **compact trail-drop logo** — "THE" above a planked wooden platform, "DROPPER" tucked below, support post, diagonal brace, and rider-trajectory arrow. Inspired by "drop ahead" trail warning signs. Assets:

- [`apps/web/src/components/TheDropperLogo.tsx`](../apps/web/src/components/TheDropperLogo.tsx) — inline SVG React component used in the public nav (`NavHeader`). Fills with `currentColor`, so it adapts to theme/context automatically. Storybook: `Components/TheDropperLogo`.
- [`apps/web/public/the-dropper-logo.svg`](../apps/web/public/the-dropper-logo.svg) — standalone SVG (same artwork) for exports and one-off use.
- [`apps/web/public/the-dropper-icon.svg`](../apps/web/public/the-dropper-icon.svg) — square icon variant (drop + arrow, no text) used to generate favicons.

**Favicon:** [`favicon.png`](../apps/web/public/favicon.png) (near-black ink) when the OS/browser prefers light chrome, [`favicon-light.png`](../apps/web/public/favicon-light.png) (near-white) when it prefers dark (`metadata.icons` in `layout.tsx`). Both are 512×512 renders of `the-dropper-icon.svg` on transparent backgrounds.

Legacy raster marks (`logo.png`, `logo-light.png`, `the-dropper-logo.png`, `the-dropper-logo-horizontal.png`) remain in `public/` — admin chrome and Open Graph images still reference them.

---

## 3. Language & Tone (The Copy)

Speak the language of the trailhead. Avoid generic "Save money!" fluff.

### Headlines

- "Every MTB sale. One feed."
- "Dialed-in deals."
- "Top-tier specs, entry-level prices."

### Micro-copy

| Avoid | Use instead |
| :--- | :--- |
| Buy Now | Snag the Deal |
| View Product | View Specs |
| Email Newsletter | The Friday Drop ([plan](MARKETING.md#5-email--the-friday-drop-owned-compounding); no list backend yet) |

Social captions and the Instagram bio use the same one-liner and affiliate honesty. Operating copy: [SOCIAL.md](SOCIAL.md).

### Transparency

Since it's an aggregator, be honest:

- "We scanned 50+ shops so you didn't have to."

---

## Implementation Notes

- **Colors**: Mapped in `apps/web/src/app/globals.css` (`:root`, `.dark`). **Light (production):** Workshop Modern OKLCH tokens on `:root`. **`html` does not use the `dark` class** (see `layout.tsx` + `ThemeProvider`); you should always see stone canvas + lime CTAs. The `.dark` block keeps lime-aligned primary/ring as a fallback if `.dark` is ever present.
- **Typography**: `--app-font-sans` / `--app-font-display` (**Geist Variable**), `--app-font-mono` (**Geist Mono Variable**). Loaded via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` in `globals.css`.
- **Components**: Primary actions use **lime** (`--primary`) with workshop patterns (open-frame search, stamp checkboxes, etc.) per [DESIGN_REDESIGN.md](DESIGN_REDESIGN.md). See [docs/ARCHITECTURE.md](ARCHITECTURE.md#component-library) for the component system.
- **Loading spinner**: Filter and sort waits on the deals list use [`KnobbyWheelSpinner`](../apps/web/src/components/KnobbyWheelSpinner.tsx) — an MTB tire (18 knobs, six spokes, lime rim and hub). The tire inherits `currentColor`; the rim and hub use `--primary` (`#a6e45a` fallback). It turns once every 2s and sticks to the vertical center of the viewport while the results are on screen, so it stays visible after you scroll. `prefers-reduced-motion` stops the spin and pulses opacity instead. Storybook: `Components/KnobbyWheelSpinner`. Route changes still use page skeletons.
- **Storybook**: Run `pnpm --filter @mtb-aggregator/web run storybook` and open **Design / Design Tokens** to view the palette and typography.
- **Pencil (layout reference)**: High-fidelity frames for Home, Deals, and Deal detail (light + dark) live in the Pencil editor document; semantic colors are mirrored as file variables from `apps/web/src/app/globals.css`. See [designs/README.md](../designs/README.md) for the variable map and exported PNG previews.
