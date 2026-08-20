import type { Meta, StoryObj } from "@storybook/react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";
import { ScrollToTop } from "./ScrollToTop";

const meta = {
  title: "Components/ScrollToTop",
  component: ScrollToTop,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollToTop>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="min-h-[200vh] bg-background p-6">
      <p className="text-sm text-muted-foreground">
        Scroll down to reveal the button in the bottom-right corner.
      </p>
      <ScrollToTop />
    </div>
  ),
};

export const Visible: Story = {
  render: () => (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Scroll to top"
      className={cn(
        "fixed bottom-6 right-4 z-30 border-border/80 bg-card/90 shadow-sm backdrop-blur-sm sm:right-6",
        focusRing,
      )}
    >
      <ArrowUp aria-hidden />
    </Button>
  ),
};
