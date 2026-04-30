import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition-[color,box-shadow,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 dark:aria-invalid:border-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "overflow-hidden focus-visible:overflow-visible bg-foreground text-background before:absolute before:inset-y-0 before:left-0 before:z-0 before:w-1 before:bg-primary before:transition-[width] before:duration-300 before:ease-out hover:text-foreground hover:before:w-full",
        outline:
          "border-foreground bg-card text-foreground transition-colors hover:bg-foreground hover:text-background aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:underline hover:underline-offset-4 aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border border-destructive bg-card text-destructive transition-colors hover:bg-destructive hover:text-background dark:bg-destructive/20 dark:hover:bg-destructive dark:hover:text-background",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "min-h-9 gap-1.5 px-3 py-2 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "min-h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 py-1.5 text-[0.625rem] in-data-[slot=button-group]:rounded-[min(var(--radius-md),10px)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-8 gap-1 rounded-[min(var(--radius-md),12px)] px-3 py-1.5 text-[0.65rem] in-data-[slot=button-group]:rounded-[min(var(--radius-md),12px)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-10 gap-1.5 px-4 py-2 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "aspect-square min-h-9 min-w-9 shrink-0 gap-0 p-0 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs":
          "aspect-square min-h-7 min-w-7 shrink-0 gap-0 rounded-[min(var(--radius-md),10px)] p-0 text-[0.625rem] in-data-[slot=button-group]:rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "aspect-square min-h-8 min-w-8 shrink-0 gap-0 rounded-[min(var(--radius-md),12px)] p-0 text-sm in-data-[slot=button-group]:rounded-[min(var(--radius-md),12px)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg":
          "aspect-square min-h-10 min-w-10 shrink-0 gap-0 p-0 text-sm [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  const content =
    !asChild && variant === "default" ? (
      <span className="relative z-[1] inline-flex items-center gap-1.5">
        {children}
      </span>
    ) : (
      children
    );

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {content}
    </Comp>
  );
}

export { Button, buttonVariants };
