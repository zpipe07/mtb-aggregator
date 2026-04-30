/**
 * Workshop Modern (Direction C) — live preview.
 *
 * This file is a Storybook-only prototype playground for the redesign proposed in
 * [docs/DESIGN_REDESIGN.md](../../../../docs/DESIGN_REDESIGN.md).
 *
 * It overrides the global theme tokens **inside** a single root wrapper so:
 *  - The new "Concrete & Lime" palette and Geist + Geist Mono pairing are visible.
 *  - The rest of the production app (and other stories) is unaffected.
 *
 * Once a primitive is approved here, it migrates into `src/components/ui/` and
 * `globals.css` gets the matching token swap.
 */

/* eslint-disable @next/next/no-img-element */

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { cn, focusRingWithin } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────────
// Theme override: scoped to the story root only.
// Mirrors the @theme block in docs/DESIGN_REDESIGN.md, Direction C.
//
// Why both `--primary` AND `--color-primary`?
// Tailwind v4 maps utilities like `bg-primary` → `background-color: var(--color-primary)`.
// In globals.css, `@theme { --color-primary: var(--primary); }` registers that pair on
// `:root`. Browsers resolve `var(--color-primary)` before inheritance can supply a
// nested `--primary`, so scoped `--primary` alone does not repaint utilities — you
// still see :root hazard orange `oklch(0.58 0.24 37)`. Setting literal `--color-*`
// values on this frame makes utilities pick up Workshop Modern colors.
// ───────────────────────────────────────────────────────────────────────────────

const WM_LIME = "oklch(0.85 0.18 130)";
const WM_INK = "oklch(0.18 0.005 240)";
const WM_STONE = "oklch(0.96 0.004 240)";
const WM_PAPER = "oklch(0.995 0.002 240)";
const WM_TILE = "oklch(0.93 0.005 240)";
const WM_MUTE = "oklch(0.92 0.005 240)";
const WM_MUTE_FG = "oklch(0.45 0.005 240)";
const WM_GRAPHITE = "oklch(0.55 0.04 240)";
const WM_OFF_WHITE = "oklch(0.99 0 0)";
const WM_SIGNAL = "oklch(0.58 0.22 25)";
const WM_RULE = "oklch(0.85 0.005 240)";
const WM_FIELD = "oklch(0.88 0.005 240)";

const workshopTheme = {
  /* shadcn / semantic (for raw var(--primary) in custom CSS) */
  "--background": WM_STONE,
  "--foreground": WM_INK,
  "--card": WM_PAPER,
  "--card-foreground": WM_INK,
  "--popover": WM_PAPER,
  "--popover-foreground": WM_INK,
  "--primary": WM_LIME,
  "--primary-foreground": WM_INK,
  "--secondary": WM_TILE,
  "--secondary-foreground": WM_INK,
  "--muted": WM_MUTE,
  "--muted-foreground": WM_MUTE_FG,
  "--accent": WM_GRAPHITE,
  "--accent-foreground": WM_OFF_WHITE,
  "--destructive": WM_SIGNAL,
  "--border": WM_RULE,
  "--input": WM_FIELD,
  "--ring": WM_LIME,
  "--radius": "0.375rem",
  "--trail": WM_GRAPHITE,
  "--trail-foreground": WM_OFF_WHITE,
  /* Tailwind @theme bridge — literal values so utilities inherit correctly */
  "--color-background": WM_STONE,
  "--color-foreground": WM_INK,
  "--color-card": WM_PAPER,
  "--color-card-foreground": WM_INK,
  "--color-popover": WM_PAPER,
  "--color-popover-foreground": WM_INK,
  "--color-primary": WM_LIME,
  "--color-primary-foreground": WM_INK,
  "--color-secondary": WM_TILE,
  "--color-secondary-foreground": WM_INK,
  "--color-muted": WM_MUTE,
  "--color-muted-foreground": WM_MUTE_FG,
  "--color-accent": WM_GRAPHITE,
  "--color-accent-foreground": WM_OFF_WHITE,
  "--color-destructive": WM_SIGNAL,
  "--color-border": WM_RULE,
  "--color-input": WM_FIELD,
  "--color-ring": WM_LIME,
  "--color-trail": WM_GRAPHITE,
  "--color-trail-foreground": WM_OFF_WHITE,
  "--app-font-sans":
    "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  "--app-font-mono":
    "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
  "--app-font-display":
    "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  fontFamily: "var(--app-font-sans)",
  letterSpacing: "-0.005em",
} as React.CSSProperties;

function WorkshopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={workshopTheme}
      className="bg-background text-foreground p-10 min-h-[60vh]"
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Tiny shared primitives
// ───────────────────────────────────────────────────────────────────────────────

const monoMicro =
  "font-[var(--app-font-mono)] text-[10px] uppercase tracking-[0.14em]";
const monoSm =
  "font-[var(--app-font-mono)] text-[11px] uppercase tracking-[0.12em]";
const display = "font-[var(--app-font-display)]";

function SectionDivider({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-end gap-4 mt-12 mb-6">
      <span className={cn(monoSm, "text-muted-foreground pb-1")}>§ {num}</span>
      <h2 className={cn(display, "text-2xl font-semibold tracking-[-0.02em]")}>
        {label}
      </h2>
      <span className="flex-1 h-px bg-border mb-2" />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn(monoSm, "text-muted-foreground mb-3")}>
      {"// "}
      {children}
    </p>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. Palette + type swatches
// ───────────────────────────────────────────────────────────────────────────────

type SwatchProps = {
  name: string;
  oklch: string;
  hex: string;
  role: string;
  invert?: boolean;
};

function Swatch({ name, oklch, hex, role, invert = false }: SwatchProps) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "h-20 rounded-sm border border-foreground/10 flex items-end p-2",
          invert ? "text-background" : "text-foreground"
        )}
        style={{ backgroundColor: oklch }}
      >
        <span className={monoMicro}>{hex}</span>
      </div>
      <div className="space-y-0.5">
        <div className={cn(monoSm, "font-medium")}>{name}</div>
        <div className={cn(monoMicro, "text-muted-foreground")}>{role}</div>
      </div>
    </div>
  );
}

function PaletteGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <Swatch
        name="Stone"
        oklch="oklch(0.96 0.004 240)"
        hex="#F1F2F4"
        role="--background"
      />
      <Swatch
        name="Paper"
        oklch="oklch(0.995 0.002 240)"
        hex="#FCFCFD"
        role="--card"
      />
      <Swatch
        name="Ink"
        oklch="oklch(0.18 0.005 240)"
        hex="#202327"
        role="--foreground"
        invert
      />
      <Swatch
        name="Lime"
        oklch="oklch(0.85 0.18 130)"
        hex="#C7E635"
        role="--primary · CTA"
      />
      <Swatch
        name="Graphite"
        oklch="oklch(0.55 0.04 240)"
        hex="#6F7782"
        role="--accent · info"
        invert
      />
      <Swatch
        name="Mute"
        oklch="oklch(0.92 0.005 240)"
        hex="#E5E6E8"
        role="--muted"
      />
      <Swatch
        name="Border"
        oklch="oklch(0.85 0.005 240)"
        hex="#D2D4D7"
        role="--border"
      />
      <Swatch
        name="Signal"
        oklch="oklch(0.58 0.22 25)"
        hex="#C04532"
        role="--destructive"
        invert
      />
    </div>
  );
}

function TypeScale() {
  return (
    <div className="space-y-8">
      <div>
        <h1
          className={cn(
            display,
            "text-6xl font-semibold tracking-[-0.025em] leading-[0.95]"
          )}
        >
          Stop searching.
          <br />
          Start shredding.
        </h1>
        <p className={cn(monoMicro, "text-muted-foreground mt-3")}>
          H1 · Geist 600 · 60px · -0.025em
        </p>
      </div>
      <div>
        <h2
          className={cn(
            display,
            "text-3xl font-semibold tracking-[-0.02em] leading-[1.05]"
          )}
        >
          Today&apos;s drop
        </h2>
        <p className={cn(monoMicro, "text-muted-foreground mt-2")}>
          H2 · Geist 600 · 30px · -0.02em
        </p>
      </div>
      <div>
        <h3 className={cn(display, "text-lg font-medium tracking-tight")}>
          SRAM Code RSC Disc Brake Set
        </h3>
        <p className={cn(monoMicro, "text-muted-foreground mt-2")}>
          H3 · Geist 500 · 18px · product names
        </p>
      </div>
      <div>
        <p className="text-[15px] leading-relaxed max-w-prose">
          Live deals across forty-seven shops, scanned every fifteen minutes.
          One screen, no spreadsheets, no algorithmic shoulder-tap.
        </p>
        <p className={cn(monoMicro, "text-muted-foreground mt-2")}>
          Body · Geist 400 · 15px · 1.55 line-height
        </p>
      </div>
      <div className="flex items-baseline gap-4">
        <span className="font-[var(--app-font-mono)] text-2xl font-semibold tabular-nums">
          $230
        </span>
        <span
          className={cn(
            monoSm,
            "text-muted-foreground line-through tabular-nums"
          )}
        >
          $660
        </span>
        <span
          className={cn(
            "px-2 py-0.5 bg-primary text-foreground rounded-sm font-[var(--app-font-mono)] text-xs font-semibold tabular-nums"
          )}
        >
          35% OFF
        </span>
      </div>
      <p className={cn(monoMicro, "text-muted-foreground")}>
        Mono · Geist Mono · prices, savings, stats, eyebrows, chips
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 2. Buttons — distinct personality per variant
// ───────────────────────────────────────────────────────────────────────────────

type PrimaryCtaProps = {
  children: React.ReactNode;
  leadingId?: string;
  /** When true, removes the trailing arrow (compact mode). */
  compact?: boolean;
};

function PrimaryCta({ children, leadingId, compact }: PrimaryCtaProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative inline-flex items-center gap-3 overflow-hidden",
        "bg-foreground rounded-sm cursor-pointer",
        "transition-transform active:translate-y-px",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        compact ? "px-3 py-1.5" : "px-5 py-2.5"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-primary transition-all duration-300 ease-out group-hover:w-full" />
      <span
        className={cn(
          "relative z-10 flex items-center gap-3 transition-colors duration-300",
          "text-background group-hover:text-foreground",
          monoSm,
          "font-medium"
        )}
      >
        {leadingId && (
          <span className="opacity-60 font-[var(--app-font-mono)]">
            [{leadingId}]
          </span>
        )}
        <span>{children}</span>
        {!compact && <span aria-hidden>→</span>}
      </span>
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer rounded-sm",
        "bg-card border border-foreground text-foreground",
        "px-5 py-2.5",
        "transition-colors hover:bg-foreground hover:text-background active:translate-y-px",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        monoSm,
        "font-medium"
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex items-center gap-2 cursor-pointer px-1 py-1.5",
        "text-foreground",
        monoSm,
        "font-medium",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      )}
    >
      <span className="text-primary translate-x-0 opacity-0 group-hover:opacity-100 group-hover:-translate-x-1 transition-all">
        ▸
      </span>
      <span className="group-hover:underline underline-offset-4 decoration-foreground/40">
        {children}
      </span>
      <span aria-hidden className="opacity-60">
        ↗
      </span>
    </button>
  );
}

function DestructiveButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer rounded-sm",
        "border border-destructive text-destructive bg-card",
        "px-4 py-2",
        "transition-colors hover:bg-destructive hover:text-background active:translate-y-px",
        monoSm,
        "font-medium"
      )}
    >
      <span aria-hidden>×</span>
      {children}
    </button>
  );
}

function IconButton({ glyph, label }: { glyph: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "size-9 inline-flex items-center justify-center rounded-sm cursor-pointer",
        "border border-foreground/40 text-foreground bg-card",
        "transition-colors hover:bg-foreground hover:text-background"
      )}
    >
      <span className="font-[var(--app-font-mono)] text-base">{glyph}</span>
    </button>
  );
}

function ButtonsShowcase() {
  return (
    <div className="space-y-6">
      <div>
        <Note>primary cta · &ldquo;lime switch&rdquo; — stripe slides right on hover</Note>
        <div className="flex items-center flex-wrap gap-3">
          <PrimaryCta>Snag the deal</PrimaryCta>
          <PrimaryCta leadingId="01">View all deals</PrimaryCta>
          <PrimaryCta compact>Apply</PrimaryCta>
        </div>
      </div>
      <div>
        <Note>secondary · ink stroke fills on hover</Note>
        <div className="flex items-center flex-wrap gap-3">
          <SecondaryButton>Browse categories</SecondaryButton>
          <SecondaryButton>Reset filters</SecondaryButton>
        </div>
      </div>
      <div>
        <Note>ghost · arrow micro-interaction reveals direction of travel</Note>
        <div className="flex items-center flex-wrap gap-3">
          <GhostButton>Read more</GhostButton>
          <GhostButton>About the dropper</GhostButton>
        </div>
      </div>
      <div>
        <Note>destructive · scoped to admin / clear actions</Note>
        <div className="flex items-center flex-wrap gap-3">
          <DestructiveButton>Clear filters</DestructiveButton>
        </div>
      </div>
      <div>
        <Note>icon · square 36, ink-stroke, mono glyphs</Note>
        <div className="flex items-center flex-wrap gap-3">
          <IconButton glyph="⌕" label="Search" />
          <IconButton glyph="☰" label="Menu" />
          <IconButton glyph="↗" label="Open in new tab" />
          <IconButton glyph="×" label="Close" />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 3. Inputs — open-frame aesthetic
// ───────────────────────────────────────────────────────────────────────────────

function SearchInput({
  placeholder = "search 8,432 live deals",
}: {
  placeholder?: string;
}) {
  return (
    <label
      className={cn(
        "group flex w-full cursor-text items-center gap-3 rounded-sm bg-card",
        "border-t border-b border-foreground px-3 py-3",
        focusRingWithin,
      )}
    >
      <span aria-hidden className="text-foreground text-base translate-y-px">
        ⌕
      </span>
      <input
        type="text"
        placeholder={placeholder}
        className={cn(
          "flex-1 bg-transparent outline-none text-foreground text-sm",
          "font-[var(--app-font-mono)] placeholder:text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "border border-border px-1.5 py-0.5 rounded-sm bg-secondary",
          monoMicro,
          "text-muted-foreground"
        )}
      >
        ⌘ K
      </span>
    </label>
  );
}

function TextInput({
  label,
  defaultValue = "",
  placeholder,
}: {
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = React.useId();
  const [value, setValue] = React.useState(defaultValue);
  const filled = value.length > 0;
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={cn(
          monoMicro,
          "block text-muted-foreground transition-colors",
          filled && "text-foreground"
        )}
      >
        {"// "}
        {label}
      </label>
      <div
        className={cn(
          "rounded-sm border-t border-b border-foreground/60 bg-card px-3 py-2",
          focusRingWithin,
        )}
      >
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full bg-transparent outline-none text-foreground text-sm",
            "font-[var(--app-font-mono)] placeholder:text-muted-foreground"
          )}
        />
      </div>
    </div>
  );
}

function StampCheckbox({
  label,
  count,
  defaultChecked = false,
}: {
  label: string;
  count?: number;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <label className="flex items-center gap-3 cursor-pointer group select-none">
      <span
        className={cn(
          "size-[18px] border-2 border-foreground rounded-[2px]",
          "flex items-center justify-center",
          "transition-colors duration-150",
          checked ? "bg-primary" : "bg-transparent"
        )}
      >
        {checked && (
          <span aria-hidden className="size-2 bg-foreground rounded-[1px]" />
        )}
      </span>
      <span className={cn(monoSm, "text-foreground")}>{label}</span>
      {count !== undefined && (
        <span className={cn(monoMicro, "text-muted-foreground tabular-nums")}>
          {count}
        </span>
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

function NativeSelect({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={cn(monoMicro, "block text-foreground")}>
        {"// "}
        {label}
      </label>
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-sm border-t border-b border-foreground/60 bg-card px-3 py-2",
          focusRingWithin,
        )}
      >
        <select
          id={id}
          className={cn(
            "flex-1 appearance-none bg-transparent outline-none text-sm",
            "font-[var(--app-font-mono)]"
          )}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span aria-hidden className="font-[var(--app-font-mono)] text-foreground">
          ▾
        </span>
      </div>
    </div>
  );
}

function InputsShowcase() {
  return (
    <div className="space-y-8 max-w-md">
      <div>
        <Note>search · 1px open frame; lime focus ring on focus-within</Note>
        <SearchInput />
      </div>
      <div>
        <Note>text · mono floating label, animates from muted to ink when filled</Note>
        <TextInput label="email" placeholder="rider@thedropper.shop" />
        <div className="h-3" />
        <TextInput label="email" defaultValue="rider@thedropper.shop" />
      </div>
      <div>
        <Note>checkbox · &ldquo;stamped&rdquo; inner square, no checkmark</Note>
        <div className="space-y-2">
          <StampCheckbox label="SRAM" count={234} defaultChecked />
          <StampCheckbox label="Shimano" count={188} />
          <StampCheckbox label="Hope" count={42} />
          <StampCheckbox label="Race Face" count={31} defaultChecked />
        </div>
      </div>
      <div>
        <Note>native select · open-frame underline, mono ▾ glyph</Note>
        <NativeSelect
          label="sort"
          options={["Recent", "Biggest savings", "Highest discount", "Price: low → high"]}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. Cards
// ───────────────────────────────────────────────────────────────────────────────

function StoreChip({ store }: { store: string }) {
  return (
    <span className={cn(monoMicro, "text-muted-foreground")}>
      {"// "}
      {store}
    </span>
  );
}

function VariantBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-foreground/40 px-2 py-0.5 rounded-sm",
        "bg-card/90 backdrop-blur-sm",
        monoMicro
      )}
    >
      <span className="tabular-nums">{count}</span>
      <span className="text-muted-foreground">variants</span>
    </span>
  );
}

function DiscountSticker({ percent }: { percent: number }) {
  return (
    <span
      className={cn(
        "inline-block bg-primary text-foreground rounded-sm px-2 py-1",
        "font-[var(--app-font-mono)] text-sm font-semibold tabular-nums",
        "shadow-[2px_2px_0_var(--foreground)]"
      )}
      style={{ transform: "rotate(-2deg)" }}
    >
      −{percent}%
    </span>
  );
}

type DealCardData = {
  sku: string;
  brand: string;
  name: string;
  price: number;
  original: number;
  store: string;
  image: string;
  variants?: number;
};

function DealCard({ deal }: { deal: DealCardData }) {
  const savings = deal.original - deal.price;
  const pct = Math.round((savings / deal.original) * 100);
  return (
    <div className="relative pt-3">
      {/* Lime tab pokes up out of the card */}
      <span
        className={cn(
          "absolute top-0 right-4 z-10 bg-primary text-foreground border border-foreground border-b-0",
          "px-2 py-0.5 rounded-t-sm",
          monoMicro,
          "tabular-nums"
        )}
      >
        {"// "}
        {deal.sku}
      </span>

      <article
        className={cn(
          "group relative bg-card border border-foreground rounded-sm overflow-hidden",
          "transition-transform duration-200 hover:-translate-y-0.5"
        )}
      >
        {/* CAD crop marks */}
        <span
          aria-hidden
          className="absolute top-1.5 left-1.5 size-3 border-l border-t border-foreground"
        />
        <span
          aria-hidden
          className="absolute bottom-1.5 right-1.5 size-3 border-r border-b border-foreground"
        />

        <div className="aspect-square overflow-hidden border-b border-foreground bg-muted relative">
          <img
            src={deal.image}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute top-3 left-3">
            <DiscountSticker percent={pct} />
          </div>
          {deal.variants && deal.variants > 1 ? (
            <div className="absolute bottom-3 right-3">
              <VariantBadge count={deal.variants} />
            </div>
          ) : null}
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <div className={cn(monoMicro, "text-muted-foreground")}>
              {"// "}
              {deal.brand}
            </div>
            <h3
              className={cn(
                display,
                "text-base font-medium leading-snug tracking-tight line-clamp-2"
              )}
            >
              {deal.name}
            </h3>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
            <div className="space-y-0.5">
              <span
                className={cn(monoMicro, "text-muted-foreground block")}
              >
                save
              </span>
              <span className="font-[var(--app-font-mono)] text-sm font-medium leading-none tabular-nums text-muted-foreground">
                ${savings}
              </span>
            </div>
            <div className="text-right space-y-0.5">
              <span
                className={cn(monoMicro, "text-muted-foreground line-through tabular-nums block")}
              >
                was ${deal.original}
              </span>
              <span className="font-[var(--app-font-mono)] text-xl font-semibold leading-none tabular-nums sm:text-2xl">
                ${deal.price}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <StoreChip store={deal.store} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <a
                href="#"
                className={cn(
                  "inline-flex min-h-9 w-full flex-1 items-center justify-center rounded-sm border border-transparent",
                  "bg-foreground px-3 py-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-background sm:flex-1",
                )}
                onClick={(e) => e.preventDefault()}
              >
                Snag
              </a>
              <a
                href="#"
                className={cn(
                  "inline-flex min-h-9 w-full flex-1 items-center justify-center rounded-sm border border-foreground bg-card px-3 py-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground sm:flex-1",
                )}
                onClick={(e) => e.preventDefault()}
              >
                View details
              </a>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function CategoryTile({
  label,
  count,
  image,
}: {
  label: string;
  count: number;
  image: string;
}) {
  return (
    <a
      href="#"
      className={cn(
        "group relative block bg-card border border-foreground rounded-sm overflow-hidden",
        "transition-transform duration-200 hover:-translate-y-0.5"
      )}
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={image}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-foreground text-background p-3 flex items-end justify-between gap-3">
        <div>
          <div className={cn(monoMicro, "text-primary")}>{"// CATEGORY"}</div>
          <div
            className={cn(
              display,
              "text-base font-medium tracking-tight leading-tight"
            )}
          >
            {label}
          </div>
        </div>
        <div className="font-[var(--app-font-mono)] text-sm flex items-center gap-1.5 tabular-nums">
          <span>{count}</span>
          <span className="text-primary">→</span>
        </div>
      </div>
    </a>
  );
}

function StatRow({
  label,
  value,
  small,
  isFirst,
}: {
  label: string;
  value: string;
  small?: boolean;
  isFirst?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3",
        !isFirst && "border-t border-background/15 pt-2"
      )}
    >
      <span
        className={cn(
          "font-[var(--app-font-mono)] tabular-nums",
          small ? "text-base" : "text-2xl font-semibold"
        )}
      >
        {value}
      </span>
      <span
        className={cn(monoMicro, "text-background/60")}
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
    </div>
  );
}

function StatTickerTile() {
  return (
    <div className="bg-foreground text-background border border-foreground rounded-sm p-5 space-y-3 h-full flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <span className="size-1.5 bg-primary rounded-full animate-pulse" />
        <span className={cn(monoMicro, "text-primary")}>{"// LIVE"}</span>
      </div>
      <div className="space-y-2.5">
        <StatRow label="SHOPS" value="47" isFirst />
        <StatRow label="LIVE DEALS" value="8,432" />
        <StatRow label="UPDATED" value="12 MIN AGO" small />
      </div>
      <div className={cn(monoMicro, "text-background/40")}>
        last sweep: worldwidecyclery, jensonusa, +5
      </div>
    </div>
  );
}

const SAMPLE_DEALS: DealCardData[] = [
  {
    sku: "A07-2F",
    brand: "SRAM",
    name: "Code RSC 4-Piston Hydraulic Disc Brake Set",
    price: 430,
    original: 660,
    store: "WORLDWIDECYCLERY",
    image: "/placeholders/workshop-modern-hero-2.jpg",
    variants: 4,
  },
  {
    sku: "B12-3C",
    brand: "Fox Racing",
    name: "Float 36 Factory Series GRIP2 Suspension Fork",
    price: 939,
    original: 1199,
    store: "JENSONUSA",
    image: "/placeholders/workshop-modern-hero-1.jpg",
    variants: 6,
  },
];

function CardsShowcase() {
  return (
    <div className="space-y-10">
      <div>
        <Note>deal card · CAD crop marks · lime SKU tab · sale price as hero, save amount secondary</Note>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          {SAMPLE_DEALS.map((d) => (
            <DealCard key={d.sku} deal={d} />
          ))}
        </div>
      </div>
      <div>
        <Note>category tile · ink panel slides over photo · mono count + lime arrow</Note>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CategoryTile
            label="Forks"
            count={124}
            image="/placeholders/workshop-modern-hero-2.jpg"
          />
          <CategoryTile
            label="Helmets"
            count={88}
            image="/stock-gear.jpg"
          />
          <CategoryTile
            label="Wheels"
            count={211}
            image="/placeholders/workshop-modern-hero-1.jpg"
          />
          <CategoryTile
            label="Bikes"
            count={47}
            image="/stock-bikes.jpg"
          />
        </div>
      </div>
      <div>
        <Note>stat ticker · ink fill · pulsing lime dot · monospace numerals</Note>
        <div className="max-w-xs">
          <StatTickerTile />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 5. Chips, badges, pagination, states
// ───────────────────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  selected = false,
}: {
  label: string;
  selected?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border",
        monoMicro,
        selected
          ? "bg-foreground text-primary border-foreground"
          : "bg-transparent text-foreground border-foreground/40 hover:border-foreground"
      )}
    >
      <span className="opacity-60">{"//"}</span>
      <span>{label}</span>
      {selected && (
        <button
          type="button"
          aria-label={`remove ${label}`}
          className="text-background bg-primary rounded-[2px] size-3.5 inline-flex items-center justify-center hover:bg-primary/80"
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  );
}

function PageNum({
  num,
  current = false,
}: {
  num: string;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "size-8 rounded-sm flex items-center justify-center border transition-colors",
        monoSm,
        "tabular-nums",
        current
          ? "bg-primary text-foreground border-foreground"
          : "border-foreground/40 hover:border-foreground hover:bg-foreground hover:text-background"
      )}
      aria-current={current ? "page" : undefined}
    >
      {num}
    </button>
  );
}

function PaginationRow() {
  return (
    <nav className="flex items-center gap-1" aria-label="pagination">
      <button
        type="button"
        className={cn(
          "px-3 py-1.5 border border-foreground rounded-sm",
          "hover:bg-foreground hover:text-background transition-colors",
          monoSm
        )}
      >
        ‹ PREV
      </button>
      <PageNum num="01" />
      <PageNum num="02" current />
      <PageNum num="03" />
      <PageNum num="04" />
      <span className={cn(monoSm, "px-1 text-muted-foreground")}>…</span>
      <PageNum num="12" />
      <button
        type="button"
        className={cn(
          "px-3 py-1.5 border border-foreground rounded-sm",
          "hover:bg-foreground hover:text-background transition-colors",
          monoSm
        )}
      >
        NEXT ›
      </button>
    </nav>
  );
}

function EmptyState() {
  return (
    <div
      className={cn(
        "border border-dashed border-foreground/40 rounded-sm p-10 text-center bg-card"
      )}
    >
      <div
        className={cn(
          "size-10 mx-auto mb-3 border-2 border-foreground rounded-full",
          "flex items-center justify-center font-[var(--app-font-mono)] text-xl"
        )}
      >
        ⊘
      </div>
      <div className={cn(monoSm)}>{"// NO DEALS MATCH"}</div>
      <div className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Try widening the filters, or browse the full live deal stream below.
      </div>
      <div className="mt-4 flex justify-center">
        <SecondaryButton>Reset filters</SecondaryButton>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className={cn(
        "border border-foreground/40 rounded-sm p-4 bg-card flex items-center gap-3",
        monoSm
      )}
    >
      <span className="size-2 bg-primary animate-pulse" />
      {"// LOADING"}
      <span className="text-muted-foreground normal-case tracking-normal">
        scanning 47 shops, fetching latest stock
      </span>
    </div>
  );
}

function ErrorState() {
  return (
    <div
      className={cn(
        "border border-destructive bg-destructive/5 rounded-sm p-4"
      )}
    >
      <div className={cn(monoSm, "text-destructive")}>
        {"// ERROR · CODE 502"}
      </div>
      <div className="text-sm text-foreground mt-1">
        Couldn&apos;t reach the deals stream — most likely transient. Retry, or
        head to{" "}
        <a href="#" className="underline underline-offset-4">
          /status
        </a>{" "}
        for details.
      </div>
    </div>
  );
}

function ChipsShowcase() {
  return (
    <div className="space-y-8">
      <div>
        <Note>filter chip · selected = ink fill, lime label, embedded × button</Note>
        <div className="flex flex-wrap gap-2">
          <FilterChip label="SRAM" selected />
          <FilterChip label="Shimano" />
          <FilterChip label="Hope" selected />
          <FilterChip label="Tire width: 2.4&quot;" selected />
          <FilterChip label="Race Face" />
          <FilterChip label="Discount ≥ 30%" selected />
        </div>
      </div>

      <div>
        <Note>discount sticker · slight tilt · ink shadow offset (no soft blur)</Note>
        <div className="flex items-center gap-4">
          <DiscountSticker percent={20} />
          <DiscountSticker percent={35} />
          <DiscountSticker percent={48} />
          <DiscountSticker percent={62} />
        </div>
      </div>

      <div>
        <Note>variant badge + store chip · all mono, all uppercase</Note>
        <div className="flex items-center gap-6">
          <VariantBadge count={4} />
          <StoreChip store="WORLDWIDECYCLERY" />
          <StoreChip store="JENSONUSA" />
        </div>
      </div>

      <div>
        <Note>pagination · boxed mono numerals, current = lime fill</Note>
        <PaginationRow />
      </div>

      <div>
        <Note>section divider · §-numbered, mono micro-label, sans display heading</Note>
        <SectionDivider num="02" label="Today's drop" />
      </div>

      <div>
        <Note>states · empty / loading / error</Note>
        <div className="space-y-4">
          <EmptyState />
          <LoadingState />
          <ErrorState />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 6. Hero bento — primitives composed
// ───────────────────────────────────────────────────────────────────────────────

function HeroBento() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8 bg-card border border-foreground rounded-sm p-8 flex flex-col gap-6 relative overflow-hidden">
        <span className={cn(monoMicro, "text-muted-foreground")}>
          {"// 2026.04.28 · WED · 4:53 PM MT"}
        </span>
        <h1
          className={cn(
            display,
            "text-5xl md:text-6xl font-semibold tracking-[-0.025em] leading-[0.95]"
          )}
        >
          Stop searching.
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">Start shredding.</span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-1 h-3 bg-primary -z-0 opacity-70"
            />
          </span>
        </h1>
        <p className="text-base text-muted-foreground max-w-md">
          Live deals across 47 mountain bike shops, scanned every fifteen
          minutes. One screen. No spreadsheets.
        </p>
        <SearchInput />
        <div className="flex items-center gap-3 flex-wrap">
          <PrimaryCta>Browse all deals</PrimaryCta>
          <GhostButton>How it works</GhostButton>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <StatTickerTile />
      </div>

      <div className="col-span-6 md:col-span-3">
        <CategoryTile
          label="Forks"
          count={124}
          image="/placeholders/workshop-modern-hero-2.jpg"
        />
      </div>
      <div className="col-span-6 md:col-span-3">
        <CategoryTile label="Helmets" count={88} image="/stock-gear.jpg" />
      </div>
      <div className="col-span-6 md:col-span-3">
        <CategoryTile
          label="Wheels"
          count={211}
          image="/placeholders/workshop-modern-hero-1.jpg"
        />
      </div>
      <div className="col-span-6 md:col-span-3">
        <DealCard deal={SAMPLE_DEALS[0]} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Storybook meta + stories
// ───────────────────────────────────────────────────────────────────────────────

function PreviewDoc() {
  return (
    <WorkshopFrame>
      <header className="flex items-end justify-between mb-2">
        <div>
          <span className={cn(monoMicro, "text-muted-foreground")}>
            {"// DIRECTION C · WORKSHOP MODERN · v1"}
          </span>
          <h1
            className={cn(
              display,
              "text-3xl font-semibold tracking-[-0.02em] mt-2"
            )}
          >
            The Dropper · component preview
          </h1>
        </div>
        <span className={cn(monoMicro, "text-muted-foreground")}>
          spec: docs/DESIGN_REDESIGN.md
        </span>
      </header>

      <SectionDivider num="00" label="Palette" />
      <PaletteGrid />

      <SectionDivider num="01" label="Type scale" />
      <TypeScale />

      <SectionDivider num="02" label="Buttons" />
      <ButtonsShowcase />

      <SectionDivider num="03" label="Inputs" />
      <InputsShowcase />

      <SectionDivider num="04" label="Cards" />
      <CardsShowcase />

      <SectionDivider num="05" label="Chips, pagination, states" />
      <ChipsShowcase />

      <SectionDivider num="06" label="Hero bento — composed" />
      <HeroBento />
    </WorkshopFrame>
  );
}

const meta = {
  title: "Design/Workshop Modern Preview",
  component: PreviewDoc,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Live preview of Direction C ('Workshop Modern' / 'Concrete & Lime') — palette + type + new component personality (CAD crop marks, lime switch CTA, stamped checkboxes, mono price hierarchy). All tokens are scoped to this preview; the rest of the app is unaffected.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PreviewDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full preview of every primitive composed top-to-bottom. */
export const FullPreview: Story = {};

/** Just the hero bento composition — useful for screenshotting. */
export const HeroOnly: Story = {
  render: () => (
    <WorkshopFrame>
      <HeroBento />
    </WorkshopFrame>
  ),
};

/** Just the deal card, isolated. */
export const DealCardOnly: Story = {
  render: () => (
    <WorkshopFrame>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {SAMPLE_DEALS.map((d) => (
          <DealCard key={d.sku} deal={d} />
        ))}
      </div>
    </WorkshopFrame>
  ),
};

/** Just the buttons, side by side. */
export const ButtonsOnly: Story = {
  render: () => (
    <WorkshopFrame>
      <ButtonsShowcase />
    </WorkshopFrame>
  ),
};
