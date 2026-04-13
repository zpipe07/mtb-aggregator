# Design Guide

Visual identity and language guidelines for the MTB Deal Aggregator. Use this when building UI, writing copy, or iterating on the design system.

---

## 2. Visual Identity & "The Vibe"

**Think "High-Tech Workshop meets Deep Woods."**

| Element | Direction |
| :--- | :--- |
| **Color Palette** | Carbon Grey (#2D2D2D), Mud/Deep Forest (#1B3022), and a high-vis **Hazard Orange** (#FF5E00) for Call-to-Action (CTA) buttons. |
| **Typography** | **Bricolage Grotesque** for display (h1–h3)—personality and energy. **Plus Jakarta Sans** for body/UI—friendly and very readable. |
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

- **Colors**: Mapped in `apps/web/src/app/globals.css` and `apps/web/src/index.css` (`:root`, `.dark`):
- **Light mode**: **Soft warm-grey canvas** (low chroma) vs **near-white cards**; neutral-ish **`--foreground`**; **`--secondary`** / **`--muted`** / **`--border`** read as grey with only a hint of hue; **`--accent`** is a cool blue-grey wash; **`--trail`** stays a muted teal for accents; orange **`--primary`** unchanged. **`--input`** is tuned darker than the page background so form controls (inputs, native selects, outline buttons) have visible borders on both canvas and cards.
- **Dark mode**: **Neutral-warm grey** base (~oklch 0.34 L, very low chroma) and **lighter cards**; **`--secondary`**, **`--muted`**, **`--accent`**, **`--trail`** are toned down so the UI isn’t forest-green; primary orange unchanged.
- **Typography**: `--app-font-display` (Bricolage Grotesque Variable) for h1–h3; `--app-font-sans` (Plus Jakarta Sans Variable) for body. Wired in `apps/web/src/app/globals.css` via `@fontsource-variable/*`.
- **Components**: CTA buttons should use the Hazard Orange accent. See [docs/ARCHITECTURE.md](ARCHITECTURE.md#component-library) for the component system.
- **Storybook**: Run `pnpm --filter @mtb-aggregator/web run storybook` and open **Design / Design Tokens** to view the palette and typography.
- **Pencil (layout reference)**: High-fidelity frames for Home, Deals, and Deal detail (light + dark) live in the Pencil editor document; semantic colors are mirrored as file variables from `apps/web/src/app/globals.css`. See [designs/README.md](../designs/README.md) for the variable map and exported PNG previews.
