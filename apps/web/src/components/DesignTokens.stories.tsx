import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./ui/button";

/**
 * Design tokens from [docs/DESIGN.md](../../../docs/DESIGN.md).
 * High-Tech Workshop meets Deep Woods.
 */
function DesignTokensDoc() {
  return (
    <div className="space-y-10 max-w-2xl">
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">Color Palette</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div
              className="h-20 rounded-lg border border-border"
              style={{ backgroundColor: "#2D2D2D" }}
            />
            <p className="text-sm font-medium text-foreground">Carbon Grey</p>
            <p className="text-xs text-muted-foreground">Reference ink · see fg token</p>
          </div>
          <div className="space-y-2">
            <div
              className="h-20 rounded-lg border border-border"
              style={{ backgroundColor: "#1B3022" }}
            />
            <p className="text-sm font-medium text-foreground">Deep Forest</p>
            <p className="text-xs text-muted-foreground">Brand mood · dark bg is lifted oklch</p>
          </div>
          <div className="space-y-2">
            <div
              className="h-20 rounded-lg border border-border"
              style={{ backgroundColor: "#FF5E00" }}
            />
            <p className="text-sm font-medium text-foreground">Hazard Orange</p>
            <p className="text-xs text-muted-foreground">#FF5E00 · primary, CTAs</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">Semantic Tokens</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded bg-primary" />
            <span className="text-sm text-muted-foreground">bg-primary (CTA)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded bg-secondary" />
            <span className="text-sm text-muted-foreground">bg-secondary (sage band)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded bg-accent" />
            <span className="text-sm text-muted-foreground">bg-accent (teal wash)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded bg-trail" />
            <span className="text-sm text-muted-foreground">bg-trail (teal pop)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded bg-muted" />
            <span className="text-sm text-muted-foreground">bg-muted</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-20 rounded border-2 border-border" />
            <span className="text-sm text-muted-foreground">border-border</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">Typography</h2>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dialed-in deals.</h1>
            <p className="text-xs text-muted-foreground mt-1">Bricolage Grotesque · h1–h3</p>
          </div>
          <div>
            <p className="text-base text-foreground">
              Body text uses Plus Jakarta Sans. Speak the language of the trailhead.
            </p>
            <p className="text-xs text-muted-foreground mt-1">Plus Jakarta Sans Variable · body</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">CTA Button</h2>
        <Button>Snag the Deal</Button>
      </section>
    </div>
  );
}

const meta = {
  title: "Design/Design Tokens",
  component: DesignTokensDoc,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Visual identity from docs/DESIGN.md. Plus Jakarta Sans + Bricolage Grotesque; orange primary; teal accent/trail.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DesignTokensDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = {};
