/**
 * Hero section prototypes for ZAC-179 — compare before promoting to HomePageContent.
 *
 * Run: pnpm --filter @mtb-aggregator/web run storybook
 * Open: Design / Hero Prototypes
 */

/* eslint-disable @next/next/no-img-element */

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchBar, SEARCH_FRAME_MIN_H } from "./SearchBar";
import { StatTicker } from "./StatTicker";
import { TheDropperLogo } from "./TheDropperLogo";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { mainNavLinkTypography } from "@/lib/mainNavStyles";

const MOCK_STATS = {
  storeCount: 25,
  dealCount: 1842,
  lastUpdated: "2h ago",
} as const;

const SUBCOPY_DEFAULT =
  "We scan the sale pages from top MTB retailers so you're not bouncing between sites.";

/** Prototype A copy variants — compare in Storybook before promoting to production. */
const PROTOTYPE_A_COPY = [
  {
    id: "every-sale",
    label: "Every MTB sale · default",
    line1: "Every MTB sale.",
    line2: "One feed.",
    subcopy: SUBCOPY_DEFAULT,
  },
  {
    id: "dialed-in",
    label: "Dialed-in · brand voice",
    line1: "Dialed-in deals.",
    line2: "One feed.",
    subcopy: SUBCOPY_DEFAULT,
  },
  {
    id: "all-sales",
    label: "All the sales · plain-spoken",
    line1: "All the sales.",
    line2: "One screen.",
    subcopy:
      "Sale pages from top MTB shops — scanned so you don't have to hop between sites.",
  },
  {
    id: "shredding",
    label: "Start shredding · keeps energy",
    line1: "Every sale, one place.",
    line2: "Start shredding.",
    subcopy: SUBCOPY_DEFAULT,
  },
  {
    id: "value",
    label: "Top-tier specs · value prop",
    line1: "Top-tier specs.",
    line2: "Entry-level prices.",
    subcopy:
      "Live deals from top MTB retailers — we watch the sale pages so you don't have to.",
  },
  {
    id: "live",
    label: "Live MTB deals · pairs with ticker",
    line1: "Live MTB deals.",
    line2: "One feed.",
    subcopy:
      "We scan sale pages from top shops and keep them updated — no tab-hopping required.",
  },
] as const;

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

function HeroFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-3">
        <p className={cn(monoMicro, "text-center text-muted-foreground")}>
          {label}
        </p>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </div>
    </div>
  );
}

/** Storybook nav stub — matches production NavHeader chrome. */
function MockNavHeader() {
  return (
    <header className="border-b border-border bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-3">
        <TheDropperLogo variant="nav" className="h-15 w-auto sm:h-20" />
        <nav className="hidden items-center gap-8 lg:flex">
          <span
            className={cn(
              mainNavLinkTypography,
              "border-b-2 border-primary pb-1 text-foreground",
            )}
          >
            HOME
          </span>
          <span
            className={cn(
              mainNavLinkTypography,
              "border-b-2 border-transparent pb-1 text-muted-foreground",
            )}
          >
            DEALS
          </span>
        </nav>
        <div className="size-10 lg:hidden" aria-hidden />
      </div>
    </header>
  );
}

/** Page frame with nav + optional flush banner (StatTicker sits directly under nav). */
function HeroPageFrame({
  label,
  topBanner,
  children,
}: {
  label: string;
  topBanner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-2">
        <p className={cn(monoMicro, "text-center text-muted-foreground")}>
          {label}
        </p>
      </div>
      <MockNavHeader />
      {topBanner}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </div>
    </div>
  );
}

function HeroSearchForm({
  showViewAll = true,
  primaryLabel = "Search",
  viewAllLabel = "View all deals",
}: {
  showViewAll?: boolean;
  primaryLabel?: string;
  viewAllLabel?: string;
}) {
  const [searchValue, setSearchValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <SearchBar
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Search deals…"
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <Button
          type="submit"
          className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}
        >
          {primaryLabel}
        </Button>
        {showViewAll ? (
          <Button
            variant="outline"
            asChild
            className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}
          >
            <Link href="/deals">{viewAllLabel}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function LimeUnderlineHeadline({
  line1,
  line2,
}: {
  line1: string;
  line2?: string;
}) {
  return (
    <div className="inline-block text-left">
      <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-6xl">
        <span className="block">{line1}</span>
        {line2 ? (
          <span className="relative inline-block">
            <span className="relative z-10">{line2}</span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary opacity-70"
            />
          </span>
        ) : null}
      </h1>
    </div>
  );
}

/** Mirrors production hero in HomePageContent.tsx (baseline). */
function CurrentHeroSection() {
  return (
    <section className="mb-12 text-center lg:mb-16">
      <LimeUnderlineHeadline line1="Stop searching." line2="Start shredding." />
      <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
        {SUBCOPY_DEFAULT}
      </p>
      <HeroSearchForm />
      <StatTicker {...MOCK_STATS} />
    </section>
  );
}

/** Prototype A body — headline, subcopy, search (no StatTicker). */
function PrototypeAHeroBody({
  line1,
  line2,
  subcopy,
}: {
  line1: string;
  line2: string;
  subcopy: string;
}) {
  return (
    <section className="mb-12 text-center lg:mb-16">
      <LimeUnderlineHeadline line1={line1} line2={line2} />
      <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
        {subcopy}
      </p>
      <HeroSearchForm />
    </section>
  );
}

/** Prototype A — live stats above headline; copy passed in for iteration. */
function PrototypeASection({
  line1,
  line2,
  subcopy,
  tickerVariant = "default",
}: {
  line1: string;
  line2: string;
  subcopy: string;
  tickerVariant?: "default" | "inverted";
}) {
  return (
    <section className="mb-12 text-center lg:mb-16">
      <StatTicker
        {...MOCK_STATS}
        variant={tickerVariant}
        className="mb-0 mt-0"
      />
      <div className="mt-6">
        <LimeUnderlineHeadline line1={line1} line2={line2} />
      </div>
      <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
        {subcopy}
      </p>
      <HeroSearchForm />
    </section>
  );
}

function renderPrototypeACopyStory(
  variant: (typeof PROTOTYPE_A_COPY)[number],
): Story {
  return {
    name: `A / ${variant.label}`,
    render: () => (
      <HeroFrame label={`// PROTOTYPE A · ${variant.label}`}>
        <PrototypeASection
          line1={variant.line1}
          line2={variant.line2}
          subcopy={variant.subcopy}
        />
      </HeroFrame>
    ),
  };
}

/** Prototype B — brand mark first, product statement, simplified CTA. */
function PrototypeBSection() {
  return (
    <section className="mb-12 text-center lg:mb-16">
      <TheDropperLogo
        variant="full"
        className="mx-auto h-16 w-auto md:h-20"
      />
      <p
        className={cn(
          monoMicro,
          "mx-auto mt-5 max-w-md text-muted-foreground",
        )}
      >
        Sale pages from {MOCK_STATS.storeCount}+ MTB shops, one feed.
      </p>
      <HeroSearchForm
        showViewAll={false}
        primaryLabel="Browse all deals"
      />
      <StatTicker {...MOCK_STATS} />
    </section>
  );
}

/** Prototype C — visual anchor + shorter headline; image stacks above on mobile. */
function PrototypeCSection() {
  return (
    <section className="mb-12 lg:mb-16">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-10">
        <div className="order-2 text-center md:order-1 md:text-left">
          <h1 className="text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground sm:text-5xl md:text-6xl">
            <span className="relative inline-block">
              <span className="relative z-10">Dialed-in MTB deals.</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary opacity-70"
              />
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground md:mx-0">
            We scan sale pages from top retailers so you don&apos;t have to.
          </p>
          <HeroSearchForm
            showViewAll={false}
            primaryLabel="Browse all deals"
          />
          <div className="mt-6 md:mt-8">
            <StatTicker {...MOCK_STATS} />
          </div>
        </div>
        <div className="order-1 md:order-2">
          {/*
            Production: replace with a real high-contrast MTB component photo
            (see docs/DESIGN.md imagery guidelines).
          */}
          <div className="overflow-hidden rounded-sm border border-foreground bg-card">
            <img
              src="/placeholders/workshop-modern-hero-2.jpg"
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: "Design/Hero Prototypes",
  component: CurrentHeroSection,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side hero prototypes for ZAC-179. Compare against Current (production) before promoting a winner to HomePageContent.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof CurrentHeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentHero: Story = {
  name: "Current (production)",
  render: () => (
    <HeroFrame label="// CURRENT · production hero">
      <CurrentHeroSection />
    </HeroFrame>
  ),
};

export const PrototypeA: Story = renderPrototypeACopyStory(PROTOTYPE_A_COPY[0]);

export const PrototypeA_DialedIn: Story = renderPrototypeACopyStory(
  PROTOTYPE_A_COPY[1],
);

export const PrototypeA_AllSales: Story = renderPrototypeACopyStory(
  PROTOTYPE_A_COPY[2],
);

export const PrototypeA_Shredding: Story = renderPrototypeACopyStory(
  PROTOTYPE_A_COPY[3],
);

export const PrototypeA_Value: Story = renderPrototypeACopyStory(
  PROTOTYPE_A_COPY[4],
);

export const PrototypeA_Live: Story = renderPrototypeACopyStory(
  PROTOTYPE_A_COPY[5],
);

/** Preferred direction: nav-flush full-bleed dark StatTicker + production copy. */
export const PrototypeA_ProductionCopy_DarkTicker: Story = {
  name: "A / production copy · dark ticker",
  render: () => (
    <HeroPageFrame
      label="// PROTOTYPE A · production copy · full-bleed dark StatTicker under nav"
      topBanner={
        <StatTicker
          {...MOCK_STATS}
          variant="inverted"
          fullBleed
        />
      }
    >
      <PrototypeAHeroBody
        line1="Stop searching."
        line2="Start shredding."
        subcopy={SUBCOPY_DEFAULT}
      />
    </HeroPageFrame>
  ),
};

export const PrototypeA_ProductionCopy_LightTicker: Story = {
  name: "A / production copy · light ticker",
  render: () => (
    <HeroFrame label="// PROTOTYPE A · production copy · default StatTicker">
      <PrototypeASection
        line1="Stop searching."
        line2="Start shredding."
        subcopy={SUBCOPY_DEFAULT}
        tickerVariant="default"
      />
    </HeroFrame>
  ),
};

export const PrototypeB: Story = {
  name: "Prototype B — Brand-first",
  render: () => (
    <HeroFrame label="// PROTOTYPE B · The Dropper mark · single CTA">
      <PrototypeBSection />
    </HeroFrame>
  ),
};

export const PrototypeC: Story = {
  name: "Prototype C — Visual hero",
  render: () => (
    <HeroFrame label="// PROTOTYPE C · product image · dialed-in headline">
      <PrototypeCSection />
    </HeroFrame>
  ),
};
