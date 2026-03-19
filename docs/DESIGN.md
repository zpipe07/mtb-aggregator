# Design Guide

Visual identity and language guidelines for the MTB Deal Aggregator. Use this when building UI, writing copy, or iterating on the design system.

---

## 2. Visual Identity & "The Vibe"

**Think "High-Tech Workshop meets Deep Woods."**

| Element | Direction |
| :--- | :--- |
| **Color Palette** | Carbon Grey (#2D2D2D), Mud/Deep Forest (#1B3022), and a high-vis **Hazard Orange** (#FF5E00) for Call-to-Action (CTA) buttons. |
| **Typography** | A bold, condensed Sans-Serif for headers (think Inter or Oswald)—it feels like a technical spec sheet. |
| **Imagery** | High-contrast, "action" photography. Avoid stock photos of smiling people on bikes. Use close-ups of gritty components: a muddy derailleur, a clean carbon weave, or a tire biting into loam. |
| **The Vibe** | **"Dialed-in."** The site shouldn't feel like a mall; it should feel like a specialized tool. |

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

- **Colors**: Mapped in `apps/web/src/index.css` (`:root`, `.dark`):
  - Carbon Grey (#2D2D2D) → `--foreground`, `--card-foreground`, `--secondary-foreground`
  - Mud/Deep Forest (#1B3022) → `--background` (dark mode), `--secondary` / `--border` (light mode tints)
  - Hazard Orange (#FF5E00) → `--primary` (CTAs), `--ring` (focus)
- **Typography**: `--font-display` (Oswald 600/700) for h1–h3; `--app-font-sans` (Geist) for body. See `apps/web/src/index.css`.
- **Components**: CTA buttons should use the Hazard Orange accent. See [docs/ARCHITECTURE.md](ARCHITECTURE.md#component-library) for the component system.
- **Storybook**: Run `pnpm --filter @mtb-aggregator/web run storybook` and open **Design / Design Tokens** to view the palette and typography.
- **Pencil (layout reference)**: High-fidelity frames for Home, Deals, and Deal detail (light + dark) live in the Pencil editor document; semantic colors are mirrored as file variables from `apps/web/src/app/globals.css`. See [designs/README.md](../designs/README.md) for the variable map and exported PNG previews.
